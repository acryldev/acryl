import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { checkContractShape, clientInjectFromSource, readServiceContract, syncServiceContract } from '../lib/contract.js'

const example = name => fileURLToPath(new URL(`../example-plugins/packages/${name}/`, import.meta.url))

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-contract-'))
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`)
  return dir
}

const withClient = (host, client) => ({
  'package.json': { name: 'x', version: '1.0.0', type: 'module', exports: { '.': './index.js', './package.json': './package.json', './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} }, acryl: { schemaVersion: 1, permissions: ['ui'] } },
  'index.js': host,
  'client.js': client,
})

test('the contract of a host and client example is what each side injects', async () => {
  const read = await readServiceContract(example('state-host-store'))
  assert.deepEqual(read.errors, [])
  assert.deepEqual(read.contract, { requires: { host: ['connection', 'dshHomePath', 'webServer'], client: ['connection', 'slots'] }, provides: { host: [], client: [] } })
})

test('a host-only example has no client side', async () => {
  const read = await readServiceContract(example('tool-basic'))
  assert.deepEqual(read.contract, { requires: { host: ['tools'] }, provides: { host: [] } })
})

test('a map-form inject and a Service class are read as Cordis reads them', async () => {
  const dir = fixture({
    'package.json': { name: 'p', version: '1.0.0', type: 'module', main: './index.js' },
    'index.js': "import { Base } from './base.js'\nexport const name = 'p'\nexport const inject = { tools: null, slots: { order: 1 } }\nexport class Store extends Base { constructor(ctx) { super(ctx, 'notesStore') } }\nexport function apply(ctx) { ctx.provide('notesIndex', {}) }\n",
    'base.js': 'export class Base { constructor() {} }\n',
  })
  try {
    const read = await readServiceContract(dir)
    assert.deepEqual(read.contract, { requires: { host: ['slots', 'tools'] }, provides: { host: ['notesIndex', 'notesStore'] } })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a client inject that is not a literal list is reported, never read as empty', () => {
  assert.deepEqual(clientInjectFromSource("exports.inject = ['slots', \"connection\"]"), { names: ['slots', 'connection'] })
  assert.deepEqual(clientInjectFromSource('exports.apply = () => {}'), { names: [] })
  assert.match(clientInjectFromSource('exports.inject = DEPS').error, /not a literal list/)
  assert.match(clientInjectFromSource("exports.inject = ['slots', name]").error, /non-literal entry "name"/)
})

test('a host entry that cannot be imported fails the contract with the cause', async () => {
  const dir = fixture(withClient("import 'not-installed-anywhere'\nexport function apply() {}\n", "exports.inject = ['slots']\n"))
  try {
    const read = await readServiceContract(dir)
    assert.equal(read.contract, undefined)
    assert.match(read.errors.join('\n'), /importing \.\/index\.js failed/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('sync writes the contract into package.json once, keeping the rest of the manifest', async () => {
  const dir = fixture(withClient("export const inject = ['connection']\nexport function apply() {}\n", "exports.inject = ['slots']\n"))
  try {
    const first = await syncServiceContract(dir)
    assert.equal(first.written, true)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(pkg.acryl, { schemaVersion: 1, permissions: ['ui'], requires: { host: ['connection'], client: ['slots'] }, provides: { host: [], client: [] } })
    assert.equal((await syncServiceContract(dir)).written, false)
    writeFileSync(join(dir, 'client.js'), "exports.inject = ['slots', 'connection']\n")
    assert.equal((await syncServiceContract(dir)).written, true)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).acryl.requires.client, ['connection', 'slots'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the catalog shape check names a wrong side or a wrong list', () => {
  assert.deepEqual(checkContractShape({ requires: { host: ['tools'], client: [] }, provides: {} }), [])
  assert.deepEqual(checkContractShape({}), [])
  assert.match(checkContractShape({ requires: ['tools'] }).join('\n'), /"acryl\.requires" must be an object/)
  assert.match(checkContractShape({ requires: { server: ['tools'] } }).join('\n'), /"acryl\.requires\.server" is not a side/)
  assert.match(checkContractShape({ provides: { host: ['bad name'] } }).join('\n'), /must be a list of service names/)
})
