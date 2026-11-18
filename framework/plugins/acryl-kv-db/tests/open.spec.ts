import { openDb } from 'acryl-db-sqlite/open'
import { describe, expect, it } from 'vitest'
import { kvOnDb } from '../src/open.ts'

describe('kvOnDb', () => {
  it('keeps its documents in a table of the app\'s own database, beside the app\'s tables, and an app that grows into SQL keeps them', async () => {
    const { db, close } = await openDb({ path: ':memory:' })
    await db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
    await db.run('INSERT INTO notes (body) VALUES (?)', 'a note')
    const kv = kvOnDb(db)
    await kv.set('settings', { theme: 'dark' })
    expect(await db.get('SELECT key, value FROM kv')).toEqual({ key: 'settings', value: '{"theme":"dark"}' })
    expect(await db.all('SELECT body FROM notes')).toEqual([{ body: 'a note' }])
    // A second view of the same database sees the same documents.
    expect(await kvOnDb(db).get('settings')).toEqual({ theme: 'dark' })
    await close()
  })

  it('uses another table when asked, and refuses a name that is not a plain identifier', async () => {
    const { db, close } = await openDb({ path: ':memory:' })
    const kv = kvOnDb(db, { table: 'app_settings' })
    await kv.set('k', 1)
    expect(await db.all('SELECT key FROM app_settings')).toEqual([{ key: 'k' }])
    expect(() => kvOnDb(db, { table: 'kv; DROP TABLE notes' })).toThrow(TypeError)
    expect(() => kvOnDb(db, { table: 'Kv' })).toThrow(TypeError)
    await close()
  })

  it('rolls an update back with the table untouched when the callback throws, inside the database\'s transaction', async () => {
    const { db, close } = await openDb({ path: ':memory:' })
    const kv = kvOnDb(db)
    await kv.set('n', 1)
    await expect(kv.update<number>('n', () => { throw new Error('stop') })).rejects.toThrow('stop')
    expect(await kv.get('n')).toBe(1)
    await close()
  })
})
