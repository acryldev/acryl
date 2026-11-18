#!/usr/bin/env node
// Make the fixtures of the upgrade tests: an app as the PUBLISHED acrylblends of a version made it (`init --template agent`, the template with the most library plugins), without
// node_modules and without the copy of the framework docs, as one .tgz. The upgrade tests unpack it, upgrade it with the current CLI and check the result. Run when a fixture is added:
//
//   node scripts/make-upgrade-fixtures.mjs 0.9.1 0.10.0
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'packages', 'cli', 'test', 'fixtures', 'upgrade')
mkdirSync(out, { recursive: true })
const versions = process.argv.slice(2)
if (versions.length === 0) {
  console.error('usage: node scripts/make-upgrade-fixtures.mjs <version>...')
  process.exit(2)
}
const run = (command, args, cwd, env = {}) => {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  if (r.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
}
for (const version of versions) {
  const scratch = mkdtempSync(join(tmpdir(), 'upgrade-fixture-'))
  try {
    run(
      'npm',
      ['exec', '--yes', `acrylblends@${version}`, '--', 'init', 'app', '--template', 'agent', '-y'],
      scratch,
    )
    rmSync(join(scratch, 'app', 'docs'), { recursive: true, force: true })
    const file = join(out, `app-${version}.tgz`)
    // No AppleDouble (`._*`) entries: a macOS tar writes them for extended attributes, and they would unpack as files on Linux.
    run('tar', ['-czf', file, '--no-xattrs', '--no-mac-metadata', '-C', scratch, 'app'], scratch, {
      COPYFILE_DISABLE: '1',
    })
    console.log(`make-upgrade-fixtures: ${version}: ${file} (${statSync(file).size} bytes)`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
