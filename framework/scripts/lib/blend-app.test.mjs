// One OS app per Blend, the Windows and Linux copy: the engine is shared by links and never written, the marker and the executable are the Blend's.
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeDirApp, NAME, seedProblems, slugOf, sourceManifest } from './blend-app.mjs'

function engineFolder(root) {
  const engine = join(root, 'engine')
  mkdirSync(join(engine, 'resources', 'app'), { recursive: true })
  mkdirSync(join(engine, 'locales'))
  writeFileSync(join(engine, 'acryl-blends'), 'binary')
  writeFileSync(join(engine, 'locales', 'en.pak'), 'strings')
  writeFileSync(join(engine, 'resources', 'app', 'main.js'), 'main')
  writeFileSync(
    join(engine, 'resources', 'app', 'product.json'),
    JSON.stringify({ product: 'ACRYL Blends', appName: 'Blank', program: ['node_modules/'] }),
  )
  return engine
}

test('a Blend app shares the engine and differs in its executable and its marker', () => {
  const root = mkdtempSync(join(tmpdir(), 'blend-app-'))
  try {
    const engine = engineFolder(root)
    const out = join(root, 'out')
    mkdirSync(out)
    const made = makeDirApp({
      engine,
      name: 'MyAccounting',
      out,
      exe: 'acryl-blends',
      platform: 'linux',
    })
    assert.equal(made.exe, join(out, 'MyAccounting', 'MyAccounting'))
    assert.equal(existsSync(join(out, 'MyAccounting', 'acryl-blends')), false)
    // Shared by a link: the same file, not a second copy.
    assert.equal(
      statSync(join(out, 'MyAccounting', 'locales', 'en.pak')).ino,
      statSync(join(engine, 'locales', 'en.pak')).ino,
    )
    const marker = JSON.parse(
      readFileSync(join(out, 'MyAccounting', 'resources', 'app', 'product.json'), 'utf8'),
    )
    assert.deepEqual(
      [marker.product, marker.appName, marker.program],
      ['MyAccounting', 'MyAccounting', ['node_modules/']],
    )
    // The engine's own marker is not touched.
    assert.equal(
      JSON.parse(readFileSync(join(engine, 'resources', 'app', 'product.json'), 'utf8')).product,
      'ACRYL Blends',
    )
    assert.match(
      readFileSync(join(out, 'MyAccounting.desktop'), 'utf8'),
      /^Exec=".*MyAccounting" --no-sandbox %U$/mu,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a name must be a folder name on every OS', () => {
  assert.equal(NAME.test('MyAccounting'), true)
  for (const bad of ['', '.hidden', 'a/b', 'a\\b', 'x'.repeat(64)])
    assert.equal(NAME.test(bad), false)
  assert.equal(slugOf('My Sales_2'), 'my-sales-2')
})

test('a pulled Blend is refused for what the engine lacks, and its manifest becomes the source form: its own fields, its packages as peers, no scripts', () => {
  const root = mkdtempSync(join(tmpdir(), 'blend-seed-'))
  try {
    const modules = join(root, 'modules')
    mkdirSync(join(modules, 'yaml'), { recursive: true })
    writeFileSync(join(modules, 'yaml', 'package.json'), '{"version":"2.9.0"}')
    const seed = join(root, 'seed')
    mkdirSync(join(seed, 'plugins'), { recursive: true })
    writeFileSync(
      join(seed, 'plugins', 'library.lock.json'),
      JSON.stringify({ plugins: { 'acryl-router': {}, 'acryl-db': {} } }),
    )
    writeFileSync(
      join(seed, 'package.json'),
      JSON.stringify({
        name: 'orbit',
        scripts: { dev: 'x' },
        dependencies: { yaml: '2.9.0', left: '1.0.0' },
      }),
    )
    assert.deepEqual(seedProblems({ seed, program: ['plugins/acryl-router/'], modules }), [
      'the framework plugin acryl-db is not in the engine',
      'the package left is not in the engine',
    ])
    assert.deepEqual(
      sourceManifest(
        {
          name: 'orbit',
          scripts: { dev: 'x' },
          dependencies: { yaml: '^2' },
          devDependencies: { ws: '1' },
        },
        modules,
      ),
      { name: 'orbit', peerDependencies: { yaml: '2.9.0' } },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
