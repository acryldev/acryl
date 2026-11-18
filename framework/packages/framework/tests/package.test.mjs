// The built package as a consumer meets it: every entry loads without Cordis, imports nothing outside itself but Node built-ins, and the
// root stays free of Node built-ins so it runs on any fetch runtime. Run after the build (`pnpm run check` builds first).

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { EXPERIMENTAL, INTERNAL, PUBLIC } from '../api-surface.mjs'
import { SUBPATHS, entryName, exportsMap } from '../subpaths.mjs'

/** The optional peer dependencies: only the Cordis forms and the conformance suites may import them, and a built file imports nothing else outside itself. */
const PEERS = ["@deepseek-ai/cordis", "@deepseek-ai/schemastery", "react", "vitest", "ws"]
const needsPeers = subpath => subpath.startsWith('cordis/') || subpath.endsWith('/conformance') || subpath === 'door/host'
const isPeer = specifier => PEERS.some(peer => specifier === peer || specifier.startsWith(`${peer}/`))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(root, 'lib')

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
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).exports, exportsMap())
})

test('every built subpath is PUBLIC or INTERNAL, never both, and `exports` is exactly PUBLIC', () => {
  const built = Object.keys(SUBPATHS)
  assert.deepEqual(PUBLIC.filter(subpath => INTERNAL.includes(subpath)), [], 'a subpath is in both lists')
  assert.deepEqual(built.filter(subpath => !PUBLIC.includes(subpath) && !INTERNAL.includes(subpath)), [], 'a built subpath is in neither list: decide whether it is public')
  assert.deepEqual([...PUBLIC, ...INTERNAL].filter(subpath => !built.includes(subpath)), [], 'a listed subpath is not built')
  assert.equal(new Set(PUBLIC).size, PUBLIC.length, 'PUBLIC lists a subpath twice')
  const exported = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).exports).filter(key => key !== './package.json')
  assert.deepEqual(exported.sort(), PUBLIC.map(subpath => (subpath === '.' ? '.' : `./${subpath}`)).sort())
  assert.deepEqual(EXPERIMENTAL.filter(subpath => !PUBLIC.includes(subpath)), [], 'an experimental subpath must be public')
})

test('the internal modules and the hosting adapters that have no gate are not exported', () => {
  const exported = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).exports)
  assert.deepEqual(exported.filter(key => key === './acryl-base' || key.startsWith('./utils/')), [])
  for (const adapter of ['aws-lambda', 'cloudflare-pages', 'cloudflare-workers', 'lambda-edge', 'netlify', 'service-worker', 'vercel'])
    assert.equal(exported.includes(`./${adapter}`), false, `${adapter} is exported`)
  assert.ok(exported.includes('./bun'), 'bun (experimental) stays')
})

test('a built file imports only its own chunks, Node built-ins and the optional peers', () => {
  for (const name of readdirSync(lib, { recursive: true }).filter(name => /\.(?:js|d\.ts)$/u.test(name))) {
    for (const specifier of importsOf(join(lib, name))) {
      assert.ok(specifier.startsWith('.') || specifier.startsWith('node:') || isPeer(specifier), `${name} imports ${specifier}`)
    }
  }
})

test('a plain entry reaches no optional peer: Cordis, schemastery, react and vitest are for the Cordis forms and the suites only', () => {
  for (const subpath of Object.keys(SUBPATHS)) {
    if (needsPeers(subpath)) continue
    const { bare } = closure(join(lib, `${entryName(subpath)}.js`))
    assert.deepEqual([...bare].filter(isPeer), [], `${subpath} imports ${[...bare].filter(isPeer).join(', ')}`)
  }
})

test('there is one Acryl class: the plain root and the Cordis router are built from the same chunk', async () => {
  const plain = await import(pathToFileURL(join(lib, 'index.js')).href)
  const served = await import(pathToFileURL(join(lib, 'cordis/router.js')).href)
  assert.equal(plain.Acryl, served.Acryl)
})

test('the root and the routers reach no Node built-in, so they run on any fetch runtime', () => {
  for (const subpath of ['.', 'router/reg-exp-router', 'router/smart-router', 'router/trie-router', 'cors', 'jwt']) {
    const { bare } = closure(join(lib, `${entryName(subpath)}.js`))
    assert.deepEqual([...bare], [], `${subpath} imports ${[...bare].join(', ')}`)
  }
})

test('every plain entry loads in plain Node, without Cordis', async () => {
  for (const subpath of Object.keys(SUBPATHS)) {
    if (needsPeers(subpath) || subpath === 'door/page' || subpath === 'door/protocol') continue
    await import(pathToFileURL(join(lib, `${entryName(subpath)}.js`)).href)
  }
})

test('the root is the framework: Acryl serves a request, and the 0.4 names App and AppRequest are gone', async () => {
  const framework = await import(pathToFileURL(join(lib, 'index.js')).href)
  const app = new framework.Acryl()
  app.get('/', c => c.text('Acryl!'))
  const response = await app.fetch(new Request('http://localhost/'))
  assert.equal(await response.text(), 'Acryl!')
  assert.equal(framework.App, undefined)
})
