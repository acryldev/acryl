// Staging under `node --watch`: the watcher takes the deletion of a staged copy it has seen for a change of the app, and the restart stages and prunes again.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { discard, folderPluginStore, prune, stage } from '../stage.ts'

let root: string
let saved: string | undefined
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stage-'))
  saved = process.env.WATCH_REPORT_DEPENDENCIES
  delete process.env.WATCH_REPORT_DEPENDENCIES
})
afterEach(() => {
  if (saved === undefined) delete process.env.WATCH_REPORT_DEPENDENCIES
  else process.env.WATCH_REPORT_DEPENDENCIES = saved
  rmSync(root, { recursive: true, force: true })
})

const source = (text: string) => {
  const dir = join(root, 'src')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.ts'), text)
  return dir
}
const staged = (name: string) => readdirSync(join(root, 'staged', name)).sort()

test('an unchanged source keeps its staged copy: staging again makes nothing new', () => {
  const dir = source('one')
  const first = stage(dir, join(root, 'staged'), 'board')
  const second = stage(dir, join(root, 'staged'), 'board')
  assert.equal(second.dir, first.dir)
  assert.equal(staged('board').length, 1)
  const changed = stage(source('two'), join(root, 'staged'), 'board')
  assert.notEqual(changed.dir, first.dir)
  assert.equal(staged('board').length, 2)
})

test('a copy is finished under a temporary name, so one with its final name is whole and none is left half made', () => {
  stage(source('one'), join(root, 'staged'), 'board')
  assert.deepEqual(
    staged('board').filter((entry) => entry.startsWith('.')),
    [],
  )
})

test('without the watcher prune and discard delete staged copies', () => {
  const first = stage(source('one'), join(root, 'staged'), 'board')
  const second = stage(source('two'), join(root, 'staged'), 'board')
  prune(join(root, 'staged'), 'board', [second.dir])
  assert.equal(existsSync(first.dir), false)
  assert.equal(existsSync(second.dir), true)
  discard(second.dir)
  assert.equal(existsSync(second.dir), false)
})

test('under node --watch nothing staged is deleted (the watcher would restart the app for it)', () => {
  process.env.WATCH_REPORT_DEPENDENCIES = '1'
  const first = stage(source('one'), join(root, 'staged'), 'board')
  const second = stage(source('two'), join(root, 'staged'), 'board')
  prune(join(root, 'staged'), 'board', [second.dir])
  prune(join(root, 'staged'), 'board', [])
  discard(second.dir)
  assert.equal(existsSync(first.dir), true)
  assert.equal(existsSync(second.dir), true)
})

test('the plugin store keeps versions behind its port: put reuses, holds answers, discard and keepOnly drop', () => {
  const store = folderPluginStore(join(root, 'staged'))
  const one = store.put('board', source('one'))
  assert.equal(store.put('board', source('one')).dir, one.dir)
  assert.equal(store.holds(one), true)
  const two = store.put('board', source('two'))
  store.keepOnly('board', two)
  assert.equal(store.holds(one), false)
  assert.equal(store.holds(two), true)
  store.discard(two)
  assert.equal(store.holds(two), false)
  const three = store.put('board', source('three'))
  store.keepOnly('board')
  assert.equal(store.holds(three), false)
})
