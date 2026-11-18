import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { openDb } from '../lib/db/sqlite'
import { openKv } from '../lib/kv/json'
import { type Io, runCli } from '../src/index'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-kv-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

function run(args: string[], cwd: string) {
  let out = ''
  let err = ''
  const io: Io = {
    stdout: { write: (t: string) => (out += t) },
    stderr: { write: (t: string) => (err += t) },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return runCli(args, io).then((code) => ({ code, out, err }))
}

async function fileWith(dir: string, entries: Record<string, unknown>) {
  const { kv, close } = await openKv({ path: join(dir, 'kv.json') })
  for (const [key, value] of Object.entries(entries)) await kv.set(key, value)
  await close()
}

/** Read the file as it is, without migrations, so the test sees what the command left. */
async function rows(path: string, sql: string) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return db
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }))
  } finally {
    db.close()
  }
}

describe('kv import', () => {
  it('moves a JSON-file store into the kv table of a SQLite file, and leaves the file as it was', async () => {
    const dir = mkdtempSync(join(scratch, 'a-'))
    await fileWith(dir, { theme: 'dark', 'todos/1': { title: 'x', done: false } })
    const result = await run(['kv', 'import', 'kv.json', 'app.sqlite'], dir)
    expect(result).toEqual({
      code: 0,
      out: 'imported 2 keys from kv.json into app.sqlite\n',
      err: '',
    })
    expect(await rows(join(dir, 'app.sqlite'), 'SELECT key, value FROM kv ORDER BY key')).toEqual([
      { key: 'theme', value: '"dark"' },
      { key: 'todos/1', value: '{"title":"x","done":false}' },
    ])
  })

  it('refuses to overwrite a key the table has unless asked, and changes nothing when it refuses', async () => {
    const dir = mkdtempSync(join(scratch, 'b-'))
    await fileWith(dir, { a: 1, b: 2 })
    expect((await run(['kv', 'import', 'kv.json', 'app.sqlite'], dir)).code).toBe(0)
    // The file now holds a, b and c: two of them are in the table already.
    await fileWith(dir, { a: 10, c: 3 })
    const refused = await run(['kv', 'import', 'kv.json', 'app.sqlite'], dir)
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/already has 2 of these keys/)
    expect(await rows(join(dir, 'app.sqlite'), 'SELECT key, value FROM kv ORDER BY key')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ])
    const replaced = await run(['kv', 'import', 'kv.json', 'app.sqlite', '--overwrite'], dir)
    expect(replaced.out).toBe('imported 3 keys from kv.json into app.sqlite, 2 overwritten\n')
    expect(await rows(join(dir, 'app.sqlite'), 'SELECT key, value FROM kv ORDER BY key')).toEqual([
      { key: 'a', value: '10' },
      { key: 'b', value: '2' },
      { key: 'c', value: '3' },
    ])
  })

  it("opens the app's database with its migrations folder, so a database with applied migrations is not refused", async () => {
    const dir = mkdtempSync(join(scratch, 'c-'))
    mkdirSync(join(dir, 'migrations'))
    writeFileSync(
      join(dir, 'migrations', '001-notes.sql'),
      'CREATE TABLE notes (id INTEGER PRIMARY KEY);\n',
    )
    const first = await openDb({
      path: join(dir, 'app.sqlite'),
      migrations: join(dir, 'migrations'),
    })
    await first.close()
    await fileWith(dir, { k: 'v' })
    expect((await run(['kv', 'import', 'kv.json', 'app.sqlite'], dir)).code).toBe(0)
    expect(await rows(join(dir, 'app.sqlite'), 'SELECT key FROM kv')).toEqual([{ key: 'k' }])
    expect(await rows(join(dir, 'app.sqlite'), 'SELECT version FROM _migrations')).toEqual([
      { version: 1 },
    ])
  })

  it('answers a missing file with exit 1 and creates nothing, and bad usage with exit 2', async () => {
    const dir = mkdtempSync(join(scratch, 'd-'))
    const missing = await run(['kv', 'import', 'nope.json', 'app.sqlite'], dir)
    expect(missing.code).toBe(1)
    expect(existsSync(join(dir, 'app.sqlite'))).toBe(false)
    expect((await run(['kv'], dir)).code).toBe(2)
    expect((await run(['kv', 'export', 'a', 'b'], dir)).code).toBe(2)
    expect((await run(['kv', 'import', 'a'], dir)).code).toBe(2)
  })
})
