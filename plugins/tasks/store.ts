/**
 * Where task changes are kept. A store is an append-only log of changes: `append` must have made the change durable before it
 * returns, and `load` returns every change in the order it was appended. The records are folded from the log, so a new backend only
 * has to keep that promise; `store.test.ts` runs the same conformance suite against every backend.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

/** One change to a task record: its id and the fields that changed. Stores treat it as opaque JSON. */
export interface TaskChange {
  readonly id: string
  readonly [field: string]: unknown
}

export interface TaskStore {
  /** Every change so far, oldest first. A change that was only partly written (a crash mid-append) is skipped. */
  load(): TaskChange[]
  /** Make one change durable. */
  append(change: TaskChange): void
  /** Release the file. */
  close(): void
}

/** One JSON object per line in a text file. Easy to read, copy and diff. */
export function jsonlStore(file: string): TaskStore {
  return {
    load() {
      if (!existsSync(file)) return []
      const changes: TaskChange[] = []
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.trim() === '') continue
        try {
          changes.push(JSON.parse(line) as TaskChange)
        } catch {
          // A torn last line (the app stopped mid-write) is skipped; every complete line before it still counts.
        }
      }
      return changes
    },
    append(change) {
      mkdirSync(dirname(file), { recursive: true })
      appendFileSync(file, `${JSON.stringify(change)}\n`)
    },
    close() {},
  }
}

/** The pieces of `node:sqlite` used here. */
interface Database {
  exec(sql: string): void
  prepare(sql: string): { run(...values: unknown[]): unknown; all(): Array<{ change: string }> }
  close(): void
}

/**
 * A SQLite file with one table, `task_changes(seq, id, change)`, appended to and never updated. Writes are synchronous with full
 * durability (`synchronous = FULL`, write-ahead log), so a change is on disk before the call that made it returns. Uses Node's
 * built-in `node:sqlite` (loaded only when this store is used, because Node marks it experimental and warns on load).
 */
export function sqliteStore(file: string): TaskStore {
  mkdirSync(dirname(file), { recursive: true })
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
    DatabaseSync: new (path: string) => Database
  }
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
  db.exec(
    'CREATE TABLE IF NOT EXISTS task_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, change TEXT NOT NULL)',
  )
  const insert = db.prepare('INSERT INTO task_changes (id, change) VALUES (?, ?)')
  const select = db.prepare('SELECT change FROM task_changes ORDER BY seq')
  return {
    load: () => select.all().map((row) => JSON.parse(row.change) as TaskChange),
    append: (change) => void insert.run(change.id, JSON.stringify(change)),
    close: () => db.close(),
  }
}

export type StoreKind = 'jsonl' | 'sqlite'

export function openStore(kind: StoreKind, directory: string): { store: TaskStore; file: string } {
  const file = `${directory}/tasks.${kind === 'sqlite' ? 'sqlite' : 'jsonl'}`
  return { store: kind === 'sqlite' ? sqliteStore(file) : jsonlStore(file), file }
}
