/**
 * The plain way to use SQL as the `kv` store, for code without Cordis (an acrylblends app): `kvOnDb(db)` gives the `kv` port over a `kv`
 * table of the `db` port (SQLite today, Postgres after spec 049 slice 2), so an app that grows from a JSON file into SQL keeps its data. The
 * Cordis plugin is a thin wrapper over it. This entry imports nothing from Cordis.
 *
 * The table is created on first use with `CREATE TABLE IF NOT EXISTS`, so it needs no migration of the app's. `update` reads and writes in
 * one `db.transaction`. `list` selects with `substr(key, 1, n) = ?`, not `LIKE`, so `%`, `_` and letter case need no escaping, and sorts by
 * code point in the end, whatever collation the database sorts with.
 */

import type { Db } from 'acryl-db'
import { checkKey, codePoints, compareKeys, decodeValue, encodeValue, type Kv, runChange } from 'acryl-kv'

export type { Kv } from 'acryl-kv'

export interface KvOnDbOptions {
  /** The table that holds the documents. Defaults to `kv`; a plain SQL identifier. */
  readonly table?: string
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u

/** The `kv` port over a `db`. It does not own the database: whoever opened it closes it, and calls after that reject. */
export function kvOnDb(db: Db, options: KvOnDbOptions = {}): Kv {
  const table = options.table ?? 'kv'
  if (!IDENTIFIER.test(table)) throw new TypeError(`acryl-kv-db: the table name must be a plain lower case SQL identifier, got ${JSON.stringify(table)}`)

  let ready: Promise<void> | undefined
  const ensure = (): Promise<void> => {
    ready ??= db.exec(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).catch((error: unknown) => {
      ready = undefined
      throw error
    })
    return ready
  }
  /**
   * Run a statement after the table exists. The table's statement and this one are both handed to the database at once (its queue keeps
   * their order), so a `close()` called right after a write cannot slip between them and leave the write on a closed database.
   */
  const after = async <T>(work: () => Promise<T>): Promise<T> => {
    const created = ensure()
    const result = work()
    const [, value] = await Promise.all([created, result])
    return value
  }
  const upsert = `INSERT INTO ${table} (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`

  return {
    async get<T>(key: string) {
      checkKey(key)
      const row = await after(() => db.get<{ value: string }>(`SELECT value FROM ${table} WHERE key = ?`, key))
      return row === undefined ? undefined : decodeValue<T>(row.value)
    },
    async set(key, value) {
      checkKey(key)
      const text = encodeValue(value)
      await after(() => db.run(upsert, key, text))
    },
    async update<T>(key: string, change: (current: T | undefined) => T) {
      checkKey(key)
      return after(() => db.transaction(async tx => {
        const row = await tx.get<{ value: string }>(`SELECT value FROM ${table} WHERE key = ?`, key)
        const next = runChange(change, row === undefined ? undefined : decodeValue<T>(row.value))
        const text = encodeValue(next)
        await tx.run(upsert, key, text)
        return decodeValue<T>(text)
      }))
    },
    async delete(key) {
      checkKey(key)
      await after(() => db.run(`DELETE FROM ${table} WHERE key = ?`, key))
    },
    async list(prefix = '') {
      const rows = await after(() => prefix === ''
        ? db.all<{ key: string }>(`SELECT key FROM ${table}`)
        : db.all<{ key: string }>(`SELECT key FROM ${table} WHERE substr(key, 1, ?) = ?`, codePoints(prefix), prefix))
      return rows.map(row => row.key).sort(compareKeys)
    },
  }
}
