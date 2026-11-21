#!/usr/bin/env node
/**
 * The `acryl` npm package on this machine, the way a user gets it: pack the selector (pack-npm-selector.mjs), `npm install --global` it into a scratch
 * prefix, then `acryl --version` and `acryl --help`. Shipped broken before this ran anywhere (0.2.5): every `acryl` on Windows (a receipt path separator).
 * Usage: node scripts/selector-round-trip.mjs
 * @module scripts/selector-round-trip
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execShim } from './lib/portable-commands.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const version = JSON.parse(readFileSync(join(root, 'distribution', 'acryl-npm-launcher', 'package.json'), 'utf8')).version
const work = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-selector-round-trip-')))
const say = message => { console.log(`selector-round-trip: ${message}`) }
try {
  say(`acryl ${version}, in ${work}`)
  execFileSync(process.execPath, [join(root, 'scripts', 'pack-npm-selector.mjs'), join(work, 'npm')], { cwd: root, stdio: 'inherit' })
  // A home of its own, and nothing that would pick another app instance.
  const home = join(work, 'home')
  mkdirSync(join(home, 'AppData', 'Local'), { recursive: true })
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local'), APPDATA: join(home, 'AppData', 'Roaming'), XDG_DATA_HOME: join(home, '.local', 'share'),
    npm_config_prefix: join(work, 'prefix'), npm_config_cache: join(work, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' }
  for (const name of ['ACRYL_HOME', 'DSH_HOME', 'ACRYL_WEB_PORT']) delete env[name]
  execShim('npm', ['install', '--global', join(work, 'npm', `acryl-${version}.tgz`)], { cwd: work, env, stdio: 'inherit' })
  const acryl = windows ? join(work, 'prefix', 'acryl.cmd') : join(work, 'prefix', 'bin', 'acryl')
  const printed = String(execShim(acryl, ['--version'], { cwd: home, env, encoding: 'utf8' })).trim()
  if (printed !== version) throw new Error(`acryl --version printed ${JSON.stringify(printed)}, expected ${version}`)
  const help = String(execShim(acryl, ['--help'], { cwd: home, env, encoding: 'utf8' }))
  if (!help.includes('ACRYL Control Center')) throw new Error('acryl --help does not describe ACRYL Control Center')
  say(`passed (acryl --version ${printed})`)
} catch (cause) {
  console.error(`selector-round-trip: FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
