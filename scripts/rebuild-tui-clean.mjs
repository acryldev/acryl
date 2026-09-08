#!/usr/bin/env node
// Force a clean acryl-cli rebuild: `rm -rf acryl-cli/lib && corepack pnpm
// --filter acryl-cli run build`. dev-run.mjs's own mtime-based staleness
// check is usually enough, but a fully clean rebuild removes any doubt when
// verifying a fix is actually built -- run this, then fully quit and
// relaunch every acryl-cli terminal tab before retesting.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const lib = join(root, 'acryl-cli', 'lib')

rmSync(lib, { recursive: true, force: true })
process.stdout.write(`removed ${lib}\n`)

const build = spawnSync('corepack', ['pnpm', '--filter', 'acryl-cli', 'run', 'build'], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(build.status ?? 1)
