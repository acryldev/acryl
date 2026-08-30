#!/usr/bin/env node
/**
 * Deterministic clean-install smoke for the npm CLI entrypoint.
 *
 * npm `-g` installs a package by symlinking its `bin` into a bin dir. The ACRYL
 * CLI must detect that it is the launcher when reached through such a symlink —
 * otherwise `acryl --version` exits 0 silently (the regression that shipped in
 * npm `acryl@0.1.8`). This script reproduces the npm bin layout, runs the CLI
 * through the symlink, and asserts `--version` prints the package version and
 * `tui --json` boots the runtime.
 *
 * Usage: node scripts/verify-npm-entrypoint.mjs   (after `pnpm --filter
 * acryl-tui run build`)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binJs = join(root, 'acryl-tui', 'lib', 'bin.js')
const manifestPath = join(root, 'acryl-tui', 'package.json')
const version = JSON.parse(readFileSync(manifestPath, 'utf8')).version

if (!existsSync(binJs)) {
  console.error(`verify-npm-entrypoint: ${binJs} not built; run 'pnpm --filter acryl-tui run build' first`)
  process.exit(1)
}

const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-sim-'))
mkdirSync(join(staging, 'bin'), { recursive: true })
mkdirSync(join(staging, 'home'), { recursive: true })
const link = join(staging, 'bin', 'acryl')
symlinkSync(binJs, link)

function run(args) {
  return spawnSync(process.execPath, [link, ...args], {
    cwd: staging,
    env: { ...process.env, HOME: join(staging, 'home') },
    encoding: 'utf8',
    timeout: 90_000,
  })
}

try {
  const versionResult = run(['--version'])
  const printed = versionResult.stdout.trim()
  if (versionResult.status !== 0) {
    console.error(`verify-npm-entrypoint: 'acryl --version' exited ${String(versionResult.status)}: ${versionResult.stderr}`)
    process.exit(1)
  }
  if (printed !== version) {
    console.error(`verify-npm-entrypoint: 'acryl --version' printed ${JSON.stringify(printed)}; expected ${JSON.stringify(version)}`)
    process.exit(1)
  }

  const jsonResult = run(['tui', '--json'])
  if (jsonResult.status !== 0) {
    console.error(`verify-npm-entrypoint: 'acryl tui --json' exited ${String(jsonResult.status)}: ${jsonResult.stderr}`)
    process.exit(1)
  }
  if (!jsonResult.stdout.includes('"mode"')) {
    console.error(`verify-npm-entrypoint: 'acryl tui --json' did not emit a runtime status line: ${jsonResult.stdout.slice(0, 200)}`)
    process.exit(1)
  }

  console.log(`verify-npm-entrypoint: OK (acryl --version -> ${version}; tui --json boots)`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
