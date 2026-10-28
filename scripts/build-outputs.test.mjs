import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { BUILD_COMMAND, findMissingBuildOutput, unbuiltMessage } from './lib/build-outputs.mjs'

/** A checkout with a surface that depends on a runtime package, which depends on a source-only plugin. */
function checkout() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'build-outputs-')))
  const write = (dir, manifest, files = []) => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest))
    for (const file of files) { mkdirSync(dirname(join(root, dir, file)), { recursive: true }); writeFileSync(join(root, dir, file), '') }
  }
  write('apps/surface', { name: 'surface', main: 'lib/main.js', exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' } }, scripts: { build: 'tsdown' }, dependencies: { runtime: 'workspace:*', yaml: '^2' } }, ['lib/main.js', 'lib/index.js'])
  write('runtime/runtime', { name: 'runtime', exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.mjs' } }, scripts: { build: 'tsdown' }, dependencies: { plugin: 'workspace:*' } })
  write('plugins/plugin', { name: 'plugin', exports: { '.': './src/index.ts' } })
  return root
}

test('names an unbuilt package a surface depends on through another, with the build command, and nothing once it is built', () => {
  const root = checkout()
  try {
    const missing = findMissingBuildOutput(root, 'apps/surface', ['lib/main.js'])
    assert.deepEqual(missing, { packageName: 'runtime', file: join('runtime', 'runtime', 'lib', 'index.mjs') })
    const message = unbuiltMessage(missing)
    assert.match(message, /^live-run: runtime is not built \(runtime[/\\]runtime[/\\]lib[/\\]index\.mjs is missing\)/u)
    assert.ok(message.includes(`\n  ${BUILD_COMMAND}\n`))
    assert.equal(BUILD_COMMAND, 'node scripts/with-build-lock.mjs corepack pnpm run build')

    // A source-only package (no build script) has nothing to build, so it is never reported.
    mkdirSync(join(root, 'runtime', 'runtime', 'lib'), { recursive: true })
    writeFileSync(join(root, 'runtime', 'runtime', 'lib', 'index.mjs'), '')
    assert.equal(findMissingBuildOutput(root, 'apps/surface', ['lib/main.js']), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('names the surface itself when the file it runs is missing', () => {
  const root = checkout()
  try {
    assert.deepEqual(findMissingBuildOutput(root, 'apps/surface', ['lib/bin.js']), { packageName: 'surface', file: join('apps', 'surface', 'lib', 'bin.js') })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
