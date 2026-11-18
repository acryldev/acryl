#!/usr/bin/env node
// The core boundary on a real app (specs/049 T018 in acryldev/acryl): make the Blank template without the frame the way a person does
// (`acrylblends init --template blank --install`), then fail when its sources or its installed packages reach the agent pack, a driver, a model
// vendor, the frame or a DSH agent package. Each offending import is named with its file and line. Needs the network for the install.
//
//   node scripts/verify-core-boundary.mjs [--keep]
import './lib/scratch-home.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { boundaryViolations, installedPackages } from './lib/core-boundary.mjs'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
const keep = process.argv.includes('--keep')
const scratch = mkdtempSync(join(tmpdir(), 'verify-core-boundary-'))
const app = join(scratch, 'core-app')
const log = (message) => console.log(`verify-core-boundary: ${message}`)

let failed = false
try {
  execFileSync(
    process.execPath,
    [cli, 'init', app, '--template', 'blank', '--bare', '--yes', '--install'],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, HOME: scratch, ACRYL_HOME: join(scratch, '.acryl') },
    },
  )
  const dependencies = Object.keys(
    JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).dependencies ?? {},
  )
  log(
    `the Blank app without the frame: ${String(dependencies.length)} dependencies (${dependencies.join(', ')}), ${String(installedPackages(app).length)} installed packages`,
  )
  const violations = boundaryViolations(app)
  if (violations.length === 0) {
    log(
      'OK: no source file and no installed package reaches the agent pack, a driver, a model vendor, the frame or a DSH agent package',
    )
  } else {
    failed = true
    for (const v of violations)
      console.error(`verify-core-boundary: ${v.where}: ${v.name} is ${v.why}`)
    console.error(
      `verify-core-boundary: FAILED: ${String(violations.length)} crossing(s) of the core boundary`,
    )
  }
} finally {
  if (keep) log(`kept ${app}`)
  else rmSync(scratch, { recursive: true, force: true })
}
process.exitCode = failed ? 1 : 0
