import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addApp, inspectApp, readApps, removeApp, runAppsCommand } from '../index.js'
import { listAllApps, listPlugins, nodeContext } from '../node-context.js'

function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-apps-'))
  try { return run(root) } finally { rmSync(root, { recursive: true, force: true }) }
}
const app = (root, name, blend = 'acrylblends.notes') => {
  mkdirSync(join(root, name), { recursive: true })
  writeFileSync(join(root, name, 'blend.yaml'), `id: ${blend}\nkind: Blend\n`)
  return join(root, name)
}

test('an app joins the list once, with its Blend, and the list file is the only state', () => scratch(root => {
  const home = join(root, 'home')
  const shop = app(root, 'shop')
  assert.deepEqual(readApps(home), [])
  const first = addApp(home, { path: shop }, { now: () => '2026-11-12T10:00:00Z' })
  assert.equal(first.added, true)
  assert.deepEqual({ ...first.entry }, { id: 'shop', path: shop, blend: 'acrylblends.notes', madeBy: 'person', added: '2026-11-12T10:00:00Z' })
  assert.equal(addApp(home, { path: shop }).added, false, 'the same folder is not listed twice')
  assert.equal(readApps(home).length, 1)
  const other = addApp(home, { path: app(join(root, 'elsewhere'), 'shop'), madeBy: 'agent' })
  assert.equal(other.entry.id, 'shop-2', 'two folders named alike get different ids')
  assert.equal(other.entry.madeBy, 'agent')
  assert.equal(JSON.parse(readFileSync(join(home, 'apps.json'), 'utf8')).apps.length, 2)
  assert.equal(removeApp(home, 'shop'), true)
  assert.equal(removeApp(home, 'shop'), false)
  assert.deepEqual(readApps(home).map(entry => entry.id), ['shop-2'])
}))

test('a folder without blend.yaml is not an app; a broken list file is an empty list, not a crash', () => scratch(root => {
  const home = join(root, 'home')
  mkdirSync(join(root, 'plain'))
  assert.throws(() => addApp(home, { path: join(root, 'plain') }), /not an ACRYL app: it has no blend\.yaml/u)
  mkdirSync(home)
  writeFileSync(join(home, 'apps.json'), '{ not json')
  assert.deepEqual(readApps(home), [])
}))

test('a listed app whose folder is gone shows as missing and is not offered to commands', () => scratch(root => {
  const home = join(root, 'home')
  const shop = app(root, 'shop')
  const { entry } = addApp(home, { path: shop })
  assert.equal(inspectApp(entry).state, 'ready')
  assert.deepEqual(listAllApps(root, home).map(a => a.label), ['shop'])
  rmSync(shop, { recursive: true })
  assert.equal(inspectApp(entry).state, 'missing')
  assert.deepEqual(listAllApps(root, home), [])
  assert.deepEqual(nodeContext(root, { home }).registeredApps().map(a => a.state), ['missing'])
}))

test('apps in the starting folder that are not listed are still offered, once', () => scratch(root => {
  const home = join(root, 'home')
  const listed = app(root, 'listed')
  app(root, 'local')
  addApp(home, { path: listed })
  assert.deepEqual(listAllApps(root, home).map(a => a.label).sort(), ['listed', 'local'])
}))

test('acryl apps lists, adds and removes, and says what to do when it cannot', () => scratch(root => {
  const home = join(root, 'home')
  app(root, 'shop')
  const out = []
  const err = []
  const run = (...argv) => runAppsCommand(argv, { home, cwd: root, out: line => out.push(line), err: line => err.push(line) })
  assert.equal(run(), 0)
  assert.match(out.pop(), /No apps yet/u)
  assert.equal(run('add', 'shop'), 0)
  assert.match(out.pop(), /^Added shop: /u)
  assert.equal(run('add', 'shop'), 0)
  assert.match(out.pop(), /already in the list/u)
  assert.equal(run('list'), 0)
  assert.match(out.pop(), /^shop {2}ready {2}acrylblends\.notes {2}/u)
  assert.equal(run('add', 'nothing'), 1)
  assert.match(err.pop(), /not an ACRYL app/u)
  assert.equal(run('add'), 2)
  assert.equal(run('remove', 'ghost'), 1)
  assert.equal(run('remove', 'shop'), 0)
  assert.equal(run('what'), 2)
  assert.deepEqual(readApps(home), [])
}))

test('the plugins of an app from the list are found by its whole path', () => scratch(root => {
  const shop = app(root, 'shop')
  mkdirSync(join(shop, 'plugins', 'cart'), { recursive: true })
  assert.deepEqual(listPlugins(join(root, 'elsewhere'), shop).map(plugin => plugin.value), ['cart'])
  assert.deepEqual(listPlugins(root, 'shop').map(plugin => plugin.value), ['cart'])
}))
