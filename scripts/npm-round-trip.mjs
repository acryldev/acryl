#!/usr/bin/env node
/**
 * The `acryl` npm package on this machine, the way a user gets it: build this machine's CLI archive, pack it and the selector as the release
 * does (publish-npm-cli.mjs), `npm install --global` both into a scratch prefix, then `acryl --version` and `acryl web --yes`.
 *
 * The Web runtime `acryl web` fetches is a small stand-in served from loopback, behind the same redirect GitHub answers a release download with:
 * what is tested is the selector's path (the manifest's name, the redirect, the checksum, extraction, starting the runtime, and stopping it), not
 * the Web app, which the release smoke boots. The stand-in records how it ended, so the stop is checked too: on POSIX a SIGTERM to `acryl` alone
 * reaches the runtime (a supervisor sends it to that one process); on Windows, where Node can only end a process, the runtime ends with `acryl`.
 *
 * Shipped broken before this ran anywhere (0.2.5): every `acryl` on Windows (a receipt path separator), and `acryl web` everywhere.
 * Usage: node scripts/npm-round-trip.mjs
 * @module scripts/npm-round-trip
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASE_MANIFEST_NAME, targetForNode } from '../distribution/acryl-npm-launcher/release-contract.js'
import { execShim, tarCommand } from './lib/portable-commands.mjs'
import { createArtifactReceipt, createReleaseManifest } from './release-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const target = targetForNode({ platform: process.platform, arch: process.arch })
const version = JSON.parse(readFileSync(join(root, 'distribution', 'acryl-npm-launcher', 'package.json'), 'utf8')).version
const work = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-npm-round-trip-')))
const started = Date.now()
const say = message => { console.log(`npm-round-trip [${((Date.now() - started) / 1000).toFixed(0)} s]: ${message}`) }
const running = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const pause = ms => new Promise(done => { setTimeout(done, ms) })
async function until(condition, what, ms = 60_000) {
  for (let waited = 0; waited < ms; waited += 200) { if (await condition()) return; await pause(200) }
  throw new Error(`timed out after ${String(ms / 1000)} s waiting for ${what}`)
}

/** The stand-in Web runtime: what the real archive's launcher runs (lib/bin.js on the bundled node), serving one page until a stop signal. */
const STAND_IN = `
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
const record = state => { writeFileSync(process.env.ACRYL_ROUND_TRIP_RECORD, JSON.stringify({ pid: process.pid, launcher: process.ppid, state })) }
const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/plain' }).end('acryl web stand-in') })
server.listen(0, '127.0.0.1', () => {
  record('serving')
  process.stdout.write('ACRYL web: http://127.0.0.1:' + server.address().port + '/\\n')
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => { record('stopped by ' + signal); process.exit(0) }) })
`

/** A Web archive laid out as build-web-archive.mjs lays one out, holding the stand-in; returns its file name. */
function standInWebArchive(directory) {
  const name = `acryl-web-${target}`
  const tree = join(directory, name)
  mkdirSync(join(tree, 'runtime', 'bin'), { recursive: true })
  mkdirSync(join(tree, 'lib'), { recursive: true })
  writeFileSync(join(tree, 'package.json'), '{ "type": "module" }\n')
  writeFileSync(join(tree, 'lib', 'bin.js'), STAND_IN)
  copyFileSync(process.execPath, join(tree, 'runtime', 'bin', windows ? 'node.exe' : 'node'))
  if (windows) writeFileSync(join(tree, 'runtime', 'bin', 'acryl-web.cmd'), '@echo off\r\n"%~dp0node.exe" "%~dp0..\\..\\lib\\bin.js" %*\r\n')
  else {
    writeFileSync(join(tree, 'runtime', 'bin', 'acryl-web'), '#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../../lib/bin.js" "$@"\n')
    chmodSync(join(tree, 'runtime', 'bin', 'acryl-web'), 0o755)
  }
  execFileSync(tarCommand(), ['-czf', join(directory, `${name}.tar.gz`), '-C', directory, name])
  return `${name}.tar.gz`
}

/** A loopback release: every download answers 302 to an asset path first, as github.com does. */
async function loopbackRelease(directory, archive) {
  const bytes = readFileSync(join(directory, archive))
  const receipt = createArtifactReceipt({ surface: 'web', target, version, location: archive, integrity: { value: createHash('sha256').update(bytes).digest('hex') } })
  const manifest = JSON.stringify(createReleaseManifest({ version, receipts: [receipt] }))
  const release = `/download/v${version}/`
  const server = createServer((request, response) => {
    if (request.url === `${release}${RELEASE_MANIFEST_NAME}`) response.writeHead(302, { location: '/assets/manifest' }).end()
    else if (request.url === `${release}${archive}`) response.writeHead(302, { location: '/assets/web' }).end()
    else if (request.url === '/assets/manifest') response.writeHead(200, { 'content-type': 'application/json' }).end(manifest)
    else if (request.url === '/assets/web') response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(bytes)
    else response.writeHead(404).end()
  })
  await new Promise(done => { server.listen(0, '127.0.0.1', done) })
  return { server, manifestUrl: `http://127.0.0.1:${String(server.address().port)}${release}${RELEASE_MANIFEST_NAME}` }
}

let release
let web
try {
  say(`${target}, acryl ${version}, in ${work}`)
  execFileSync(process.execPath, [join(root, 'scripts', 'build-cli-archive.mjs'), target, join(work, 'artifacts')], { cwd: root, stdio: 'inherit' })
  execFileSync(process.execPath, [join(root, 'scripts', 'publish-npm-cli.mjs'), '--pack-only', join(work, 'npm'), '--only', target], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ACRYL_CLI_ARTIFACT_DIR: join(work, 'artifacts') },
  })
  say('packed')

  // A home of its own, and nothing that would pick another app instance.
  const home = join(work, 'home')
  mkdirSync(join(home, 'AppData', 'Local'), { recursive: true })
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local'), APPDATA: join(home, 'AppData', 'Roaming'), XDG_DATA_HOME: join(home, '.local', 'share'),
    npm_config_prefix: join(work, 'prefix'), npm_config_cache: join(work, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false',
    ACRYL_WEB_HOME: join(work, 'web') }
  for (const name of ['ACRYL_HOME', 'DSH_HOME', 'ACRYL_WEB_PORT', 'ACRYL_RELEASE_MANIFEST_URL']) delete env[name]
  // --omit=optional: the selector's optional dependency on this target names the version being tested, which the registry may already hold; the
  // runtime installed beside it is the one under test, and the selector finds it there as it finds a registry-installed one.
  execShim('npm', ['install', '--global', '--omit=optional', join(work, 'npm', `acryl-cli-${target}-${version}.tgz`), join(work, 'npm', `acryl-${version}.tgz`)], { cwd: work, env, stdio: 'inherit' })
  const acryl = windows ? join(work, 'prefix', 'acryl.cmd') : join(work, 'prefix', 'bin', 'acryl')
  say('installed')

  const printed = String(execShim(acryl, ['--version'], { cwd: home, env, encoding: 'utf8' })).trim()
  if (printed !== version) throw new Error(`acryl --version printed ${JSON.stringify(printed)}, expected ${version}`)
  say(`acryl --version: ${printed}`)

  const archive = standInWebArchive(join(work, 'web-release'))
  release = await loopbackRelease(join(work, 'web-release'), archive)
  const record = join(work, 'web-runtime.json')
  web = spawn(windows ? `"${acryl}"` : acryl, ['web', '--yes'], {
    cwd: home, env: { ...env, ACRYL_RELEASE_MANIFEST_URL: release.manifestUrl, ACRYL_ROUND_TRIP_RECORD: record }, stdio: ['ignore', 'pipe', 'pipe'], shell: windows, windowsHide: true,
  })
  let output = ''
  web.stdout.on('data', chunk => { output += String(chunk) })
  web.stderr.on('data', chunk => { output += String(chunk) })
  const exited = new Promise(done => { web.on('exit', code => { done(code) }) })
  await until(() => /ACRYL web: (\S+)\r?\n/u.test(output) || web.exitCode !== null, 'acryl web to print its URL')
  const url = /ACRYL web: (\S+)\r?\n/u.exec(output)?.[1]
  if (url === undefined) throw new Error(`acryl web exited ${String(web.exitCode)} without a URL:\n${output}`)
  const page = await fetch(url)
  if (page.status !== 200 || await page.text() !== 'acryl web stand-in') throw new Error(`acryl web's URL answered ${String(page.status)}`)
  say(`acryl web --yes: fetched the manifest and the runtime through their redirects, verified, started it, ${url} answers`)

  const runtime = JSON.parse(readFileSync(record, 'utf8'))
  // Stop `acryl` alone: SIGTERM on POSIX, where it must pass the signal on; on Windows this ends the process, and the runtime must end with it.
  process.kill(runtime.launcher, 'SIGTERM')
  await until(() => !running(runtime.pid), 'the Web runtime to end with acryl', 30_000)
  const port = new URL(url).port
  await until(async () => { try { await fetch(url); return false } catch { return true } }, `port ${port} to be free`, 10_000)
  const ended = JSON.parse(readFileSync(record, 'utf8')).state
  if (!windows && ended !== 'stopped by SIGTERM') throw new Error(`the Web runtime did not get acryl's SIGTERM; its last state: ${ended}`)
  await exited
  say(`stopped acryl alone: the runtime ended (${windows ? 'with it' : ended}) and port ${port} is free`)
  say('passed')
} catch (cause) {
  console.error(`npm-round-trip: FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
  process.exitCode = 1
} finally {
  if (web !== undefined && web.exitCode === null) web.kill('SIGKILL')
  if (release !== undefined) await new Promise(done => { release.server.close(done) })
  const record = join(work, 'web-runtime.json')
  if (existsSync(record)) { const { pid } = JSON.parse(readFileSync(record, 'utf8')); try { process.kill(pid, 'SIGKILL') } catch { /* ended */ } }
  rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
