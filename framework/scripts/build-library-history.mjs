#!/usr/bin/env node
// Make packages/cli/shared/library-history.json: for every library plugin, every file, the hashes that file has had in the released versions of `acrylblends`. `acrylblends upgrade` uses it to
// tell a file an old app got from a release (safe to replace) from one the app edited, for apps made before `plugins/library.lock.json` existed. Each version is installed from the registry into
// a scratch folder and asked what it copies; hashes already in the file are kept, so a release only adds its own.
//
//   node scripts/build-library-history.mjs 1.5.19   (after each release: the gate's library-history test fails until it is in)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'packages', 'cli', 'shared', 'library-history.json')
const versions = process.argv.slice(2)
if (versions.length === 0) {
  console.error('usage: node scripts/build-library-history.mjs <version>...')
  process.exit(2)
}
const history = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {}

// Run inside each installed version: copy every library plugin into a scratch app and print the hashes of its files (the same digest as src/lock.ts).
const PROBE = `
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyPlugin, readLibrary } from '@acryldev/blends/cli'
const digest = (b) => createHash('sha256').update(b.toString('utf8').replace(/\\r\\n/g, '\\n')).digest('hex').slice(0, 20)
const walk = (dir, inside, out) => { for (const e of readdirSync(dir).sort()) { const p = join(dir, e); const n = inside ? inside + '/' + e : e; if (statSync(p).isDirectory()) walk(p, n, out); else out[n] = digest(readFileSync(p)) } return out }
const app = mkdtempSync(join(tmpdir(), 'history-app-'))
mkdirSync(join(app, 'plugins'))
const result = {}
for (const plugin of readLibrary().values()) { copyPlugin(plugin, app); result[plugin.name] = walk(join(app, 'plugins', plugin.name), '', {}) }
rmSync(app, { recursive: true, force: true })
process.stdout.write(JSON.stringify(result))
`
for (const version of versions) {
  const dir = mkdtempSync(join(tmpdir(), 'history-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{"name":"history","private":true,"type":"module"}\n')
    const install = spawnSync(
      'npm',
      [
        'install',
        `acrylblends@${version}`,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
      ],
      { cwd: dir, encoding: 'utf8' },
    )
    if (install.status !== 0)
      throw new Error(`npm install acrylblends@${version} failed: ${install.stderr}`)
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (probe.status !== 0)
      throw new Error(
        `acrylblends@${version} could not list its plugins: ${probe.stderr.slice(0, 600)}`,
      )
    const result = JSON.parse(probe.stdout)
    let added = 0
    for (const [plugin, files] of Object.entries(result)) {
      history[plugin] ??= {}
      for (const [file, hash] of Object.entries(files)) {
        history[plugin][file] ??= []
        if (!history[plugin][file].includes(hash)) {
          history[plugin][file].push(hash)
          added += 1
        }
      }
    }
    console.log(
      `build-library-history: ${version}: ${Object.keys(result).length} plugins, ${added} new hashes`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const sorted = Object.fromEntries(
  Object.entries(history)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plugin, files]) => [
      plugin,
      Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    ]),
)
writeFileSync(target, `${JSON.stringify(sorted)}\n`)
// The releases the history covers, so a test can fail a release that forgot to add itself (packages/cli/test/library-history.test.ts).
const versionsFile = join(root, 'packages', 'cli', 'shared', 'library-history-versions.json')
const covered = new Set([
  ...(existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')) : []),
  ...versions,
])
// Numeric by major.minor.patch; a prerelease (1.0.0-rc.1) before its release.
const core = (v) => v.split('-')[0].split('.').map(Number)
const order = (a, b) =>
  core(a).reduce((d, n, i) => d || n - core(b)[i], 0) ||
  Number(!a.includes('-')) - Number(!b.includes('-'))
writeFileSync(versionsFile, `${JSON.stringify([...covered].sort(order))}\n`)
// In the repository's own format, so the lint step of the check passes on what this wrote.
const formatted = spawnSync(
  join(root, 'node_modules', '.bin', 'biome'),
  ['format', '--write', target, versionsFile],
  { stdio: 'inherit' },
)
if (formatted.status !== 0)
  console.error('build-library-history: biome format failed; run pnpm run format')
console.log(`build-library-history: wrote ${target}`)
