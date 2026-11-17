#!/usr/bin/env node
/**
 * The `acryl` npm package on this machine, the way a user gets it: build this machine's CLI archive, pack it and the selector as the release
 * does (publish-npm-cli.mjs), `npm install --global` both into a scratch prefix, then `acryl --version`.
 *
 * Shipped broken before this ran anywhere (0.2.5): every `acryl` on Windows (a receipt path separator). `acryl --web` and `--gui` no longer download
 * a Web runtime (they make the launcher Blend, spec 050 T024), so the stand-in Web release this once served is gone.
 * Usage: node scripts/npm-round-trip.mjs
 * @module scripts/npm-round-trip
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targetForNode } from '../distribution/acryl-npm-launcher/release-contract.js'
import { execShim } from './lib/portable-commands.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const target = targetForNode({ platform: process.platform, arch: process.arch })
const version = JSON.parse(readFileSync(join(root, 'distribution', 'acryl-npm-launcher', 'package.json'), 'utf8')).version
const work = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-npm-round-trip-')))
const started = Date.now()
const say = message => { console.log(`npm-round-trip [${((Date.now() - started) / 1000).toFixed(0)} s]: ${message}`) }
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
    npm_config_prefix: join(work, 'prefix'), npm_config_cache: join(work, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' }
  for (const name of ['ACRYL_HOME', 'DSH_HOME', 'ACRYL_WEB_PORT']) delete env[name]
  // --omit=optional: the selector's optional dependency on this target names the version being tested, which the registry may already hold; the
  // runtime installed beside it is the one under test, and the selector finds it there as it finds a registry-installed one.
  execShim('npm', ['install', '--global', '--omit=optional', join(work, 'npm', `acryl-cli-${target}-${version}.tgz`), join(work, 'npm', `acryl-${version}.tgz`)], { cwd: work, env, stdio: 'inherit' })
  const acryl = windows ? join(work, 'prefix', 'acryl.cmd') : join(work, 'prefix', 'bin', 'acryl')
  say('installed')

  const printed = String(execShim(acryl, ['--version'], { cwd: home, env, encoding: 'utf8' })).trim()
  if (printed !== version) throw new Error(`acryl --version printed ${JSON.stringify(printed)}, expected ${version}`)
  say(`acryl --version: ${printed}`)
  say('passed')
} catch (cause) {
  console.error(`npm-round-trip: FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
