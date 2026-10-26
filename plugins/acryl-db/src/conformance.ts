/**
 * The `db` conformance suite: what every provider of the port must do, as Vitest tests. A provider passes it to be accepted
 * (`describeDbConformance('acryl-db-sqlite', open)` in its own tests); the SQL is the portable subset, with `?` bindings, so the same
 * suite runs unchanged on SQLite and Postgres.
 *
 * The transaction cases are the contract the SQL facade documents (and its SQLite tests check): other calls and transactions wait for
 * an active transaction, a rejected callback rolls back and rejects with its own error, and a handle is dead once its transaction settles.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Db, DbExecutor } from './facade/database.ts'
import { applyMigrations } from './facade/migrations.ts'
import { readMigrationFiles } from './migration-files.ts'
import { MIGRATIONS_TABLE } from './index.ts'

/** A fresh, empty database from the provider under test, and how to close it. */
export interface DbUnderTest {
  readonly db: Db
  close(): Promise<void>
}

/** A promise and the function that settles it, for holding a transaction open. */
function gate(): { readonly promise: Promise<void>, readonly open: () => void } {
  let open!: () => void
  const promise = new Promise<void>(resolve => { open = resolve })
  return { promise, open }
}

export function describeDbConformance(provider: string, open: () => Promise<DbUnderTest>): void {
  describe(`db conformance: ${provider}`, () => {
    const opened: DbUnderTest[] = []
    const fresh = async (): Promise<Db> => {
      const subject = await open()
      opened.push(subject)
      return subject.db
    }
    afterEach(async () => {
      await Promise.all(opened.splice(0).map(subject => subject.close()))
    })

    it('round-trips null, integers, bigints in the safe range, reals, text and bytes', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE value_probe (n INTEGER, i INTEGER, b BIGINT, r DOUBLE PRECISION, t TEXT, x BYTEA)')
      const bytes = new Uint8Array([0, 1, 254, 255])
      await db.run('INSERT INTO value_probe (n, i, b, r, t, x) VALUES (?, ?, ?, ?, ?, ?)', null, 42, 9_007_199_254_740_991n, 1.5, 'café ✓', bytes)
      const row = await db.get<{ n: unknown, i: unknown, b: unknown, r: unknown, t: unknown, x: unknown }>('SELECT n, i, b, r, t, x FROM value_probe')
      expect(row).toEqual({ n: null, i: 42, b: 9_007_199_254_740_991, r: 1.5, t: 'café ✓', x: bytes })
      expect(row?.x).toBeInstanceOf(Uint8Array)
    })

    it('answers get with undefined and all with [] when nothing matches', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE empty_probe (value INTEGER)')
      expect(await db.get('SELECT value FROM empty_probe WHERE value = ?', 1)).toBeUndefined()
      expect(await db.all('SELECT value FROM empty_probe')).toEqual([])
    })

    it('reports how many rows run changed', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE change_probe (value INTEGER)')
      expect(await db.run('INSERT INTO change_probe (value) VALUES (?), (?), (?)', 1, 2, 3)).toEqual({ changes: 3 })
      expect(await db.run('UPDATE change_probe SET value = value + 10 WHERE value < ?', 3)).toEqual({ changes: 2 })
      expect(await db.run('DELETE FROM change_probe WHERE value = ?', 99)).toEqual({ changes: 0 })
    })

    it('runs several statements in one exec', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE multi_probe (value INTEGER); INSERT INTO multi_probe (value) VALUES (1); INSERT INTO multi_probe (value) VALUES (2);')
      expect(await db.all('SELECT value FROM multi_probe ORDER BY value')).toEqual([{ value: 1 }, { value: 2 }])
    })

    it('commits work done through the transaction handle and resolves the callback value', async () => {
      const db = await fresh()
      const value = await db.transaction(async tx => {
        await tx.exec('CREATE TABLE commit_probe (value INTEGER)')
        await tx.run('INSERT INTO commit_probe (value) VALUES (?)', 1)
        return 'committed'
      })
      expect(value).toBe('committed')
      expect(await db.all('SELECT value FROM commit_probe')).toEqual([{ value: 1 }])
    })

    it('rolls back when the callback rejects, and rejects with that same error', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE rollback_probe (value INTEGER)')
      const failure = new Error('roll back')
      const outcome = db.transaction(async tx => {
        await tx.run('INSERT INTO rollback_probe (value) VALUES (?)', 1)
        throw failure
      })
      await expect(outcome).rejects.toBe(failure)
      expect(await db.all('SELECT value FROM rollback_probe')).toEqual([])
    })

    it('makes other calls and transactions wait for an active transaction, then runs them in call order', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE queue_probe (value INTEGER)')
      const started = gate()
      const release = gate()
      const first = db.transaction(async tx => {
        await tx.run('INSERT INTO queue_probe (value) VALUES (?)', 1)
        started.open()
        await release.promise
      })
      await started.promise
      const settled: string[] = []
      const write = db.run('INSERT INTO queue_probe (value) VALUES (?)', 2).then(() => { settled.push('write') })
      const second = db.transaction(async tx => { await tx.run('INSERT INTO queue_probe (value) VALUES (?)', 3) }).then(() => { settled.push('second') })
      const read = db.all<{ value: number }>('SELECT value FROM queue_probe ORDER BY value').then(rows => { settled.push('read'); return rows })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(settled).toEqual([])
      release.open()
      await Promise.all([first, write, second])
      expect(await read).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }])
      expect(settled).toEqual(['write', 'second', 'read'])
    })

    it('keeps a rolled-back transaction from leaking into calls made while it ran', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE isolation_probe (value INTEGER)')
      const transaction = db.transaction(async tx => {
        await tx.run('INSERT INTO isolation_probe (value) VALUES (?)', 1)
        await Promise.resolve()
        throw new Error('roll back')
      })
      const before = db.all('SELECT value FROM isolation_probe')
      const write = db.run('INSERT INTO isolation_probe (value) VALUES (?)', 2)
      const after = db.all('SELECT value FROM isolation_probe')
      await expect(transaction).rejects.toThrow('roll back')
      await write
      expect(await before).toEqual([])
      expect(await after).toEqual([{ value: 2 }])
    })

    it('rejects a transaction handle used after its transaction settles', async () => {
      const db = await fresh()
      await db.exec('CREATE TABLE stale_probe (value INTEGER)')
      let handle!: DbExecutor
      await db.transaction(async tx => {
        handle = tx
        await tx.run('INSERT INTO stale_probe (value) VALUES (?)', 1)
      })
      await expect(handle.run('INSERT INTO stale_probe (value) VALUES (?)', 2)).rejects.toThrow()
      await expect(handle.get('SELECT value FROM stale_probe')).rejects.toThrow()
      expect(await db.all('SELECT value FROM stale_probe')).toEqual([{ value: 1 }])
    })

    it('applies migrations once and in order, and refuses a schema newer than the code', async () => {
      const db = await fresh()
      const first = [{ version: 1, statements: ['CREATE TABLE notes (body TEXT)', "INSERT INTO notes (body) VALUES ('kept')"] }]
      await applyMigrations(db, first, { table: MIGRATIONS_TABLE })
      await applyMigrations(db, first, { table: MIGRATIONS_TABLE })
      await applyMigrations(db, [...first, { version: 2, statements: ['ALTER TABLE notes ADD COLUMN title TEXT'] }], { table: MIGRATIONS_TABLE })
      expect(await db.all('SELECT body, title FROM notes')).toEqual([{ body: 'kept', title: null }])
      expect(await db.get(`SELECT version FROM ${MIGRATIONS_TABLE}`)).toEqual({ version: 2 })
      await expect(applyMigrations(db, first, { table: MIGRATIONS_TABLE })).rejects.toThrow('Schema version 2 is newer than supported version 1')
    })

    it('rolls every pending migration back together when one fails', async () => {
      const db = await fresh()
      const failing = [
        { version: 1, statements: ['CREATE TABLE migration_first (value TEXT)', "INSERT INTO migration_first (value) VALUES ('retained')"] },
        { version: 2, statements: ['CREATE TABLE migration_second (value TEXT)', 'THIS IS NOT SQL'] },
      ]
      await expect(applyMigrations(db, failing, { table: MIGRATIONS_TABLE })).rejects.toThrow()
      await expect(db.all('SELECT value FROM migration_first')).rejects.toThrow()
      await expect(db.all(`SELECT version FROM ${MIGRATIONS_TABLE}`)).rejects.toThrow()
      await applyMigrations(db, [failing[0]!, { version: 2, statements: ['CREATE TABLE migration_second (value TEXT)'] }], { table: MIGRATIONS_TABLE })
      expect(await db.get(`SELECT version FROM ${MIGRATIONS_TABLE}`)).toEqual({ version: 2 })
      expect(await db.all('SELECT value FROM migration_first')).toEqual([{ value: 'retained' }])
    })

    it('applies an app\'s numbered migration files', async () => {
      const db = await fresh()
      const folder = await mkdtemp(join(tmpdir(), 'acryl-db-migrations-'))
      try {
        await writeFile(join(folder, '001-notes.sql'), 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\nINSERT INTO notes (id, body) VALUES (1, \'first\');\n')
        await writeFile(join(folder, '002-tags.sql'), 'CREATE TABLE tags (note INTEGER NOT NULL, tag TEXT NOT NULL);\n')
        await applyMigrations(db, await readMigrationFiles(folder), { table: MIGRATIONS_TABLE })
        await db.run('INSERT INTO tags (note, tag) VALUES (?, ?)', 1, 'todo')
        expect(await db.all('SELECT body, tag FROM notes JOIN tags ON tags.note = notes.id')).toEqual([{ body: 'first', tag: 'todo' }])
        expect(await db.get(`SELECT version FROM ${MIGRATIONS_TABLE}`)).toEqual({ version: 2 })
      } finally {
        await rm(folder, { recursive: true, force: true })
      }
    })
  })
}
