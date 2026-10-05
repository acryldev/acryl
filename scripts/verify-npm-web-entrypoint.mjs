#!/usr/bin/env node
/** Verify the packed acryl-web package from an external npm installation. */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'
import { isolatedEnvironment } from './lib/isolated-run.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'apps', 'acryl-web')
const staging = mkdtempSync(join(tmpdir(), 'acryl-web-npm-'))
let isolated

try {
  const windows = process.platform === 'win32'
  // `pnpm pack`, not `npm pack`: acryl-web depends on real workspace
  // packages (`dsh-client-ui-brand-acryl`, `cordis-plugin-market`) via the
  // `workspace:*` protocol - only pnpm's own pack/publish rewrites that to
  // the dependency's real published version in the packed manifest. `npm
  // pack` leaves the literal string `workspace:*` in the packed
  // package.json, which a standalone install (this script's whole point)
  // cannot resolve - reproduced directly: `pnpm add ./tgz` in a plain temp
  // dir failed with "Cannot resolve package from workspace because
  // workspace packages were not loaded into the resolver" until this fix.
  execFileSync(corepackCommand(process.platform), ['pnpm', 'pack', '--pack-destination', staging], {
    cwd: packageDir,
    stdio: 'inherit',
    ...corepackSpawnOptions(process.platform),
  })
  const archive = readdirSync(staging).find(name => name.endsWith('.tgz'))
  if (!archive) throw new Error('verify-npm-web-entrypoint: pnpm pack produced no archive')

  // acryl-web depends on workspace packages that are not on the npm registry (the runtime, the control plane, the plugins). A
  // standalone install can only resolve them if each is packed too and pinned through overrides to its own tarball.
  const closure = workspaceClosure()
  const overrides = {}
  for (const { name, dir } of closure) {
    const before = new Set(readdirSync(staging))
    execFileSync(corepackCommand(process.platform), ['pnpm', 'pack', '--pack-destination', staging], {
      cwd: dir,
      stdio: 'inherit',
      ...corepackSpawnOptions(process.platform),
    })
    const packed = readdirSync(staging).find(file => file.endsWith('.tgz') && !before.has(file))
    if (!packed) throw new Error(`verify-npm-web-entrypoint: pnpm pack produced no archive for ${name}`)
    overrides[name] = `file:./${packed}`
  }

  writeFileSync(join(staging, 'package.json'), `${JSON.stringify({ private: true, pnpm: { overrides } }, null, 2)}\n`)
  execFileSync(corepackCommand(process.platform), ['pnpm', '--dir', staging, 'add', '--ignore-scripts', `./${archive}`], {
    cwd: staging,
    stdio: 'inherit',
    ...corepackSpawnOptions(process.platform),
  })
  const executable = join(staging, 'node_modules', '.bin', windows ? 'acryl-web.cmd' : 'acryl-web')
  // The packed app boots a profile and re-links its packages into it, so it runs in an isolated home (never the machine's real ACRYL home), on a port
  // that scans for a free one instead of taking 3080 from a running app. The throwaway root is removed with the staging directory.
  isolated = isolatedEnvironment({ label: 'web-smoke', port: 3290 })
  const result = spawnSync(executable, ['--json'], {
    cwd: staging,
    encoding: 'utf8',
    env: isolated.env,
    timeout: 90_000,
    ...corepackSpawnOptions(process.platform),
  })
  if (result.status !== 0) {
    throw new Error(`verify-npm-web-entrypoint: 'acryl-web --json' failed: ${result.stderr}`)
  }
  const jsonLine = result.stdout.split('\n').find(line => line.startsWith('{'))
  if (!jsonLine) throw new Error(`verify-npm-web-entrypoint: missing readiness output: ${result.stdout}`)
  const output = JSON.parse(jsonLine)
  // A URL without the launch token means the profile did not mount (the page would answer "authentication required"): a half-booted app must not pass.
  if (typeof output.url !== 'string' || !output.url.startsWith('http://') || !output.url.includes('?token=')) {
    throw new Error(`verify-npm-web-entrypoint: invalid readiness output: ${result.stdout}`)
  }
  console.log(`verify-npm-web-entrypoint: OK (${output.url})`)
} finally {
  isolated?.dispose()
  rmSync(staging, { recursive: true, force: true })
}

/** Every workspace package reachable from acryl-web through `workspace:` dependencies, excluding acryl-web itself, with its directory. */
function workspaceClosure() {
  const byName = new Map()
  for (const group of ['apps', 'runtime', 'plugins', 'examples', 'distribution']) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const manifest = join(base, entry.name, 'package.json')
      if (!entry.isDirectory() || !existsSync(manifest)) continue
      byName.set(JSON.parse(readFileSync(manifest, 'utf8')).name, join(base, entry.name))
    }
  }
  const seen = new Map()
  const visit = (dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const deps = { ...manifest.dependencies, ...manifest.optionalDependencies }
    for (const [name, range] of Object.entries(deps)) {
      if (!String(range).startsWith('workspace:') || seen.has(name)) continue
      const target = byName.get(name)
      if (target === undefined) throw new Error(`verify-npm-web-entrypoint: workspace dependency ${name} has no package directory`)
      seen.set(name, target)
      visit(target)
    }
  }
  visit(packageDir)
  return [...seen].map(([name, dir]) => ({ name, dir }))
}
