// The built package as a consumer meets it: every entry loads without Cordis, imports nothing outside itself but Node built-ins (and pg,
// an optional peer, only when a Postgres database opens), and the root stays free of Node built-ins so it runs on any fetch runtime. Run
// after the build (`pnpm run check` builds first).

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { SUBPATHS, entryName, exportsMap } from '../subpaths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(root, 'lib')

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
/** Optional peer dependencies (`pg` for `acrylblends/db/postgres`): an app installs one only for the entry that needs it. */
const optionalPeers = new Set(Object.keys(manifest.peerDependenciesMeta ?? {}).filter(name => manifest.peerDependenciesMeta[name].optional === true))

/** The modules a built file imports, read by TypeScript's own scanner, so code examples in comments are not mistaken for imports. */
const importsOf = file => ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles.map(entry => entry.fileName)

/** Every module a built file reaches through relative imports, with the bare specifiers they import. */
function closure(start) {
  const files = new Set()
  const bare = new Set()
  const visit = (file) => {
    if (files.has(file)) return
    files.add(file)
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith('.')) visit(join(dirname(file), specifier))
      else bare.add(specifier)
    }
  }
  visit(start)
  return { files, bare }
}

test('package.json exports every subpath of the table, and nothing else', () => {
  assert.deepEqual(manifest.exports, exportsMap())
})

/** The modules a file imports statically (`import`/`export ... from`), which load with it; a dynamic `import()` loads when it runs. */
const staticImportsOf = (file) => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false)
  return source.statements
    .filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined)
    .map(node => node.moduleSpecifier.text)
}


test('a built file imports only its own chunks and Node built-ins, and an optional peer only through import() in JavaScript', () => {
  for (const name of readdirSync(lib, { recursive: true }).filter(name => /\.(?:js|d\.ts)$/u.test(name))) {
    const file = join(lib, name)
    const declarations = name.endsWith('.d.ts')
    for (const specifier of importsOf(file)) {
      const own = specifier.startsWith('.') || specifier.startsWith('node:')
      assert.ok(own || (!declarations && optionalPeers.has(specifier)), `${name} imports ${specifier}`)
    }
    for (const specifier of staticImportsOf(file)) assert.ok(!optionalPeers.has(specifier), `${name} imports the optional peer ${specifier} statically`)
  }
})

test('pg is an optional peer dependency, and the only one', () => {
  assert.deepEqual(manifest.peerDependencies, { pg: '^8.23.1' })
  assert.deepEqual([...optionalPeers], ['pg'])
  assert.equal(manifest.dependencies, undefined)
})

test('the root and the routers reach no Node built-in, so they run on any fetch runtime', () => {
  for (const subpath of ['.', 'router/reg-exp-router', 'router/smart-router', 'router/trie-router', 'cors', 'jwt']) {
    const { bare } = closure(join(lib, `${entryName(subpath)}.js`))
    assert.deepEqual([...bare], [], `${subpath} imports ${[...bare].join(', ')}`)
  }
})

test('every entry loads in plain Node, without Cordis', async () => {
  for (const subpath of Object.keys(SUBPATHS)) await import(pathToFileURL(join(lib, `${entryName(subpath)}.js`)).href)
})

test('the root is the framework: Acryl serves a request, and App is the same class under its 0.4 name', async () => {
  const framework = await import(pathToFileURL(join(lib, 'index.js')).href)
  const app = new framework.Acryl()
  app.get('/', c => c.text('Acryl!'))
  const response = await app.fetch(new Request('http://localhost/'))
  assert.equal(await response.text(), 'Acryl!')
  assert.equal(framework.App, framework.Acryl)
})
