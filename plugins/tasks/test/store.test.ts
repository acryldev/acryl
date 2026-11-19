import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { jsonlStore, openStore, type StoreKind, sqliteStore, type TaskStore } from '../store.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
  dirs.push(dir)
  return dir
}

/** The promise every backend keeps, run against each one. */
for (const kind of ['jsonl', 'sqlite'] as StoreKind[]) {
  describe(`task store conformance: ${kind}`, () => {
    const open = (dir: string): TaskStore => openStore(kind, dir).store

    test('an empty store loads nothing', () => {
      const store = open(directory())
      assert.deepEqual(store.load(), [])
      store.close()
    })

    test('changes come back in the order they were appended, with their fields intact', () => {
      const store = open(directory())
      const changes = [
        { id: 'b', status: 'running', input: { text: 'line one\nline two "quoted" \u00e9\u4e2d' } },
        { id: 'a', status: 'running', detail: [1, { nested: true }, null] },
        { id: 'b', status: 'completed', result: 0 },
      ]
      for (const change of changes) store.append(change)
      assert.deepEqual(store.load(), changes)
      store.close()
    })

    test('a change is durable before append returns: a second reader sees it, and so does a reopened store', () => {
      const dir = directory()
      const writer = open(dir)
      writer.append({ id: 'x', status: 'running' })
      assert.deepEqual(open(dir).load(), [{ id: 'x', status: 'running' }])
      writer.close()
      const reopened = open(dir)
      reopened.append({ id: 'x', status: 'completed' })
      assert.equal(reopened.load().length, 2)
      reopened.close()
    })

    test('a thousand changes keep their order', () => {
      const store = open(directory())
      for (let index = 0; index < 1000; index++) store.append({ id: `t${index}`, n: index })
      const loaded = store.load()
      assert.equal(loaded.length, 1000)
      assert.deepEqual(
        loaded.map((change) => change.n),
        Array.from({ length: 1000 }, (_, index) => index),
      )
      store.close()
    })
  })
}

test('jsonl: a torn last line is skipped and every complete line before it still counts', () => {
  const dir = directory()
  const file = join(dir, 'tasks.jsonl')
  writeFileSync(file, '{"id":"a","status":"running"}\n')
  appendFileSync(file, '{"id":"b","stat')
  assert.deepEqual(jsonlStore(file).load(), [{ id: 'a', status: 'running' }])
})

test('sqlite: the log is append-only in one table', () => {
  const dir = directory()
  const store = sqliteStore(join(dir, 'tasks.sqlite'))
  store.append({ id: 'a' })
  store.append({ id: 'a', status: 'done' })
  assert.equal(store.load().length, 2)
  store.close()
})
