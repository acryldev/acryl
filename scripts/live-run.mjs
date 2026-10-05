#!/usr/bin/env node
/**
 * Run one ACRYL surface live (real model, real browser or window) without any chance of touching the machine's real app data.
 *
 *   node scripts/live-run.mjs web      [--port 3290] [--key-file ~/.secure-storage/llmproviders/deepseek/deepseek.json] [--keep]
 *   node scripts/live-run.mjs desktop  [--port 3291] [--key-file ...] [--keep]
 *   node scripts/live-run.mjs tui      [--key-file ...] [--keep]      (runs in a detached tmux session; attach or send keys with tmux)
 *
 * The run gets an isolated environment (`scripts/lib/isolated-run.mjs`: its own HOME, ACRYL and engine homes, Electron user data, ACRYL_REQUIRE_ISOLATED_HOME
 * so the runtime refuses a real home) and the model key in its process environment only: it is read from the key file, never printed, never written.
 * The real homes are snapshotted first; on exit the run stops its processes, checks that its port is free, compares the real homes with the snapshot and
 * fails loudly if anything changed. `--keep` leaves the throwaway root for inspection (its path is printed). Stop with Ctrl-C or SIGTERM.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { osHomeDirectory } from './lib/instance-module.mjs'
import { assertRealHomesUntouched, isolatedEnvironment, snapshotRealHomes } from './lib/isolated-run.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [surface, ...rest] = process.argv.slice(2)
const option = (name, fallback) => { const at = rest.indexOf(`--${name}`); return at >= 0 ? rest[at + 1] : fallback }
const keep = rest.includes('--keep')
if (!['web', 'desktop', 'tui'].includes(surface)) { console.error('usage: live-run.mjs web|desktop|tui [--port N] [--key-file F] [--keep]'); process.exit(2) }

const realHome = osHomeDirectory()
const keyFile = (option('key-file', join(realHome, '.secure-storage/llmproviders/deepseek/deepseek.json'))).replace(/^~/u, realHome)
const key = JSON.parse(readFileSync(keyFile, 'utf8')).deepseek_api_key
if (typeof key !== 'string' || key === '') throw new Error(`live-run: no deepseek_api_key in ${keyFile}`)

const port = Number(option('port', surface === 'desktop' ? '3291' : '3290'))
const isolated = isolatedEnvironment({ label: `live-${surface}`, port, extra: { DEEPSEEK_API_KEY: key } })
const before = snapshotRealHomes(realHome)
const portInUse = () => new Promise(done => { const probe = createConnection({ port, host: '127.0.0.1' }, () => { probe.destroy(); done(true) }); probe.on('error', () => { done(false) }) })
if (await portInUse()) { isolated.dispose(); throw new Error(`live-run: port ${String(port)} is already in use`) }

let child
let session
if (surface === 'web') {
  child = spawn(process.execPath, [join(root, 'apps/acryl-web/lib/bin.js'), '--no-open', '--port', String(port)], { cwd: root, env: isolated.env, stdio: ['ignore', 'pipe', 'pipe'] })
} else if (surface === 'desktop') {
  child = spawn(process.execPath, [join(root, 'apps/acryl-desktop/scripts/launch-dev.mjs')], { cwd: root, env: isolated.env, stdio: ['ignore', 'pipe', 'pipe'] })
} else {
  session = `acryl-live-${String(process.pid)}`
  const project = join(isolated.root, 'project')
  spawnSync('mkdir', ['-p', project])
  const envArgs = Object.entries(isolated.env).filter(([name]) => /^(HOME|ACRYL_|DSH_|DEEPSEEK_API_KEY|PATH|TERM|LANG)/u.test(name)).map(([name, value]) => `${name}=${value}`)
  spawnSync('tmux', ['new-session', '-d', '-s', session, '-x', '140', '-y', '40', '-c', project, 'env', ...envArgs, process.execPath, join(root, 'apps/acryl-cli/lib/bin.js')], { stdio: 'inherit' })
}

const announce = chunk => {
  for (const line of String(chunk).split('\n')) {
    const url = /(https?:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/u.exec(line)?.[1]
    if (url !== undefined) console.log(`live-run: ${surface} url ${url}`)
  }
}
child?.stdout.on('data', announce)
child?.stderr.on('data', announce)
writeFileSync(join(isolated.root, 'live-run.json'), `${JSON.stringify({ surface, pid: child?.pid, session, port, root: isolated.root })}\n`)
console.log(`live-run: ${surface} started in ${isolated.root}${session === undefined ? '' : ` (tmux session ${session})`}; Ctrl-C or SIGTERM to stop and verify`)

let stopping = false
async function stop(code) {
  if (stopping) return
  stopping = true
  child?.kill('SIGTERM')
  if (session !== undefined) { spawnSync('tmux', ['send-keys', '-t', session, 'C-c']); spawnSync('sleep', ['2']); spawnSync('tmux', ['kill-session', '-t', session]) }
  await new Promise(done => setTimeout(done, 4000))
  let failure
  if (child !== undefined && child.exitCode === null) { child.kill('SIGKILL'); failure = 'the process did not stop' }
  if (surface !== 'tui' && await portInUse()) failure = `${failure ?? ''} port ${String(port)} is still in use`.trim()
  try { assertRealHomesUntouched(before, `live-run ${surface}`) } catch (error) { failure = `${failure === undefined ? '' : `${failure}; `}${error.message}` }
  if (keep) console.log(`live-run: kept ${isolated.root}`)
  else rmSync(isolated.root, { recursive: true, force: true })
  if (failure !== undefined) { console.error(`live-run: FAILED - ${failure}`); process.exit(1) }
  console.log('live-run: stopped, port free, real homes untouched')
  process.exit(code)
}
process.on('SIGINT', () => { void stop(0) })
process.on('SIGTERM', () => { void stop(0) })
child?.on('exit', () => { void stop(0) })
setInterval(() => {}, 1 << 30)
