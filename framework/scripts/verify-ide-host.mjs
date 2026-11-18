#!/usr/bin/env node
// The composition gate for the host inversion (docs/plans/ide-host-inversion.md): the blank template is scaffolded through the built CLI with the
// frame packages as `file:` specs, installed, and its generated launcher runs in --check mode. It must report every row active, none pending,
// no DSH web row mounted, and a provider removed/restored and two reloads clean. The browser acceptance ((a)-(h), the PTY, the chat mock, the
// door) is the template gate; this one is the composition.
//
//   node --import ./scripts/workspace-source.mjs scripts/verify-ide-host.mjs [--keep]
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { frameSpecsEnv } from './lib/ide-specs.mjs'

const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'verify-ide-host-'))
const keep = process.argv.includes('--keep')
const log = (message) => console.log(`verify-ide-host: ${message}`)
const fail = (message) => {
  throw new Error(`verify-ide-host: ${message}`)
}
const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
const app = join(scratch, 'app')
const home = join(scratch, 'home')

const run = (command, args, cwd = app, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0)
    fail(
      `${command} ${args.join(' ')} failed (exit ${String(result.status)}):\n${result.stdout}${result.stderr}`,
    )
  return result.stdout
}

try {
  const env = {
    ACRYLBLENDS_FRAME_PACKAGES: frameSpecsEnv(root, {
      dshVersion: '0.2.0-rc.2',
    }),
  }
  run(
    process.execPath,
    [cli, 'init', app, '--name', 'host-app', '--template', 'blank', '--yes', '--no-next'],
    root,
    env,
  )
  run('npm', ['install', '--no-audit', '--no-fund'])
  log('scaffolded and installed the blank app')
  const check = run(
    process.execPath,
    ['--import', './plugins/acryl-node-server/src/register.ts', 'scripts/ide-host.mjs', '--check'],
    app,
    { ACRYLBLENDS_HOME: home, ACRYLBLENDS_PORT: '0' },
  )
  for (const line of check.split('\n').filter((entry) => entry.startsWith('acrylblends host:')))
    log(line.slice('acrylblends host: '.length))
  if (!/every row active \(\d+ rows\), no DSH web row mounted/u.test(check))
    fail(`the composition did not report every row active with no DSH web row:\n${check}`)
  if (!/PENDING on provider removal, active on restore, two reloads clean/u.test(check))
    fail(`the lifecycle check did not pass:\n${check}`)
  run('npm', ['test'])
  run('npm', ['run', 'check'])
  log("the app's own tests and typecheck pass")
  log('OK')
} finally {
  if (keep) console.error(`verify-ide-host: kept ${scratch}`)
  else rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
