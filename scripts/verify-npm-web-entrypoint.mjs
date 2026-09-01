#!/usr/bin/env node
/** Verify the packed acryl-web package from an external npm installation. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'acryl-web')
const staging = mkdtempSync(join(tmpdir(), 'acryl-web-npm-'))

try {
  const windows = process.platform === 'win32'
  execFileSync(windows ? 'npm.cmd' : 'npm', ['pack', packageDir, '--silent', '--ignore-scripts'], {
    cwd: staging,
    stdio: 'inherit',
    ...corepackSpawnOptions(process.platform),
  })
  const archive = readdirSync(staging).find(name => name.endsWith('.tgz'))
  if (!archive) throw new Error('verify-npm-web-entrypoint: npm pack produced no archive')

  writeFileSync(join(staging, 'package.json'), '{"private":true}\n')
  execFileSync(corepackCommand(process.platform), ['pnpm', '--dir', staging, 'add', '--ignore-scripts', `./${archive}`], {
    cwd: staging,
    stdio: 'inherit',
    ...corepackSpawnOptions(process.platform),
  })
  const executable = join(staging, 'node_modules', '.bin', windows ? 'acryl-web.cmd' : 'acryl-web')
  const result = spawnSync(executable, ['--json'], {
    cwd: staging,
    encoding: 'utf8',
    timeout: 90_000,
    ...corepackSpawnOptions(process.platform),
  })
  if (result.status !== 0) {
    throw new Error(`verify-npm-web-entrypoint: 'acryl-web --json' failed: ${result.stderr}`)
  }
  const jsonLine = result.stdout.split('\n').find(line => line.startsWith('{'))
  if (!jsonLine) throw new Error(`verify-npm-web-entrypoint: missing readiness output: ${result.stdout}`)
  const output = JSON.parse(jsonLine)
  if (typeof output.url !== 'string' || !output.url.startsWith('http://')) {
    throw new Error(`verify-npm-web-entrypoint: invalid readiness output: ${result.stdout}`)
  }
  console.log(`verify-npm-web-entrypoint: OK (${output.url})`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
