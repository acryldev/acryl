# Data: the `db` port, migrations and choosing a store

An app that keeps records (users, notes, orders) keeps them in a SQL database, and reaches it through one small interface, `db`. Handlers and
stores take a `Db` as an argument and never import a driver, so the file or server behind it can change without touching them. SQLite is the
provider today; a Postgres provider (Postgres or Supabase through `DATABASE_URL`) is planned and serves the same interface.

## Choosing

| The app | Use | State |
| --- | --- | --- |
| Normal web or desktop app, users, lists, orders | `db` with SQLite (the `notes` and `chat` templates) | available |
| Hosted, many users | `db` with Postgres or Supabase | planned |
| Tiny, one person, a few screens | [`kv`](#a-tiny-app-kv), named JSON documents with no SQL | available |
| Agents or long tasks that must survive a restart | `durable`, in the same database as `db` | planned |

Start with `db` when the data has users, lists or relations: SQL is what people and coding agents already know. Start with `kv` when the whole
data is a handful of settings or a small list that one process reads and writes.

## A tiny app: `kv`

`kv` keeps named JSON documents in one file, with no SQL and no migrations. It suits a settings page, a demo, a one-person tool.

```ts
import { openKv } from 'acrylblends/kv/json'

const { kv, close } = await openKv({ path: 'data/kv.json' })

await kv.set('theme', 'dark')
const theme = await kv.get<string>('theme') // 'dark'; undefined for a key that was never set

// Change a value from the value it has now, without losing a concurrent change.
const visits = await kv.update<number>('visits', (current) => (current ?? 0) + 1)

await kv.set('todos/1', { title: 'Buy milk', done: false })
await kv.set('todos/2', { title: 'Write docs', done: true })
const keys = await kv.list('todos/') // ['todos/1', 'todos/2'], sorted by code point

await kv.delete('todos/1') // a key that is not there is not an error
await close()
```

- A key is a non-empty string; a prefix such as `todos/` groups related documents. A value is JSON (`null`, booleans, numbers, strings, arrays,
  objects). `undefined`, functions, bigints and `NaN` are refused with a `TypeError` before anything is written, and a value read back is a copy.
- `update` runs your function with the current value (`undefined` when the key is missing) and stores what it returns. The function is
  **synchronous**: an `async` function is a type error. Read what you need first with `await kv.get(...)`, then update with a plain function.
  If it throws, the value stays as it was.
- Every write reaches the disk before its promise resolves, and the file is replaced as a whole (a temporary file, then a rename), so a crash
  or a power cut leaves the old file or the new one, never half of one. A file that exists but does not parse stops the app with a message that
  names it; it is never started over.
- Like `db`, the store is passed to the code that needs it (`createApp(kv)`), opened in one place, and closed when the process stops.
  A test opens a file in a temporary folder.

### When to move to SQL

The whole file is kept in memory and rewritten on every write, and one process owns it. Move to `db` when:

- more than one process must write (two writers would overwrite each other);
- the file grows past a few megabytes, or you need to search, sort or join the data;
- the data gets relations (users who own notes).

The same `kv` interface runs on SQL, so the code does not change, only the line that opens it. `kvOnDb` keeps the documents in a `kv` table of the
database from `openDb`, and `copyKv` moves what the file holds:

```ts
import { copyKv } from 'acrylblends/kv'
import { openKv } from 'acrylblends/kv/json'
import { kvOnDb } from 'acrylblends/kv/db'
import { openDb } from 'acrylblends/db/sqlite'

const file = await openKv({ path: 'data/kv.json' })
const sql = await openDb({ path: 'data/app.sqlite', migrations: 'migrations' })

const { copied } = await copyKv(file.kv, kvOnDb(sql.db)) // refuses to overwrite a key the table already has, unless you pass { overwrite: true }

await file.close()
await sql.close()
```

On the command line, `npx acrylblends kv import data/kv.json data/app.sqlite` does the same (add `--overwrite` to replace keys the table has).
The table is created on first use, beside the app's own tables; nothing else changes.

## Open the database

`openDb` from `acrylblends/db/sqlite` opens one SQLite file, applies your migrations, and returns the database next to the function that closes it:

```ts
import { openDb } from 'acrylblends/db/sqlite'

const { db, close } = await openDb({ path: 'data/app.sqlite', migrations: 'migrations' })
```

- `path` is the file, created with its folder when it does not exist. `':memory:'` opens a database that lives and dies with the process, which
  is what tests use.
- `migrations` is a folder of numbered SQL files, relative to the working directory (see below).
- `db` is the port: `exec`, `run`, `get`, `all` and `transaction`, every one returning a promise. It has no `close`, so no part of the app can
  close the database another part is using. `close` is the opener's: call it once, when the process stops.

Pass `db` to the code that needs it. Nothing opens the database at import time, so importing a module never creates a file:

```ts
import type { Db } from 'acrylblends/db'

export function notesStore(db: Db) {
  return {
    async titles(userId: number): Promise<string[]> {
      const rows = await db.all<{ title: string }>(
        'SELECT title FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
        userId,
      )
      return rows.map((row) => row.title)
    },
  }
}
```

## Migrations

The shape of the database lives in `migrations/`, one numbered file per change:

```
migrations/
  001-notes.sql
  002-tags.sql
```

```sql
-- migrations/002-tags.sql
CREATE TABLE tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  PRIMARY KEY (note_id, name)
);
```

- Files are named `NNN-name.sql` and numbered from 1 with no gaps. A gap, a repeated number or a file named otherwise stops the app at start
  with a message that names it.
- On start, `openDb` applies the files that have not run yet, in order, **in one transaction**: a failing file leaves the database as it was.
- The version is recorded in the `_migrations` table. Do not touch that table.
- **Never edit a file that has been applied.** A database that already ran `001` does not run it again, so an edit changes only new databases.
  To change a table, add the next file (`ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`).
- A database whose version is newer than your files (an older build started on newer data) is refused. The app does not start.
- A migration is plain SQL. Put the data change next to the shape change in the same file when they belong together.

To add a feature that needs a column or a table, the work is always the same three steps: write the next migration, change the store that
reads and writes it, and change the handlers and views that use the store.

## Reading and writing

```ts
// One row, or undefined.
const note = await db.get<Note>('SELECT * FROM notes WHERE id = ? AND user_id = ?', id, userId)

// Many rows.
const notes = await db.all<Note>('SELECT * FROM notes WHERE user_id = ? ORDER BY id', userId)

// A write: how many rows it changed.
const { changes } = await db.run('DELETE FROM notes WHERE id = ? AND user_id = ?', id, userId)
if (changes === 0) return c.notFound()

// A write that gives back the row it made.
const created = await db.get<Note>(
  'INSERT INTO notes (user_id, title, body, updated_at) VALUES (?, ?, ?, ?) RETURNING *',
  userId, title, body, new Date().toISOString(),
)
```

- Values go in as **bindings** after the SQL (`?`, in order), never inside the SQL text. This is what keeps a title like `'); DROP TABLE notes;--`
  a title. A binding is `null`, a number, a bigint, a string or a `Uint8Array`; turn a boolean into `0` or `1` and a date into
  `toISOString()` yourself.
- `exec(sql)` runs SQL text with no bindings, and may hold several statements. Use it for setup, not for user input.
- `db.get` has no `lastInsertRowid`. To get the new row or its id, end the insert with `RETURNING *` or `RETURNING id`.
- `changes` is what makes "update only if nothing changed meanwhile" possible: `UPDATE ... WHERE id = ? AND version = ?` and check `changes`.

## Transactions

Changes that must happen together go in `transaction`. Everything inside goes through the handle the callback receives:

```ts
await db.transaction(async (tx) => {
  const { changes } = await tx.run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?', amount, from, amount)
  if (changes === 0) throw new Error('not enough money')
  await tx.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', amount, to)
})
```

- If the callback throws, the transaction is rolled back and `transaction` rejects with that same error.
- Other calls, and other transactions, wait until the transaction finishes. So **never call `db` itself inside the callback**, only `tx`: that
  call would wait for a transaction that waits for it, and never return.
- The handle stops working when the callback settles. Do not keep it.

## Writing SQL that moves to Postgres

The Postgres provider is not released yet, and it will serve the same interface. SQL that stays inside this list runs on both:

- Placeholders are `?` on every provider.
- Use `RETURNING` to get a new row, not a driver-specific "last id".
- Keep dates as ISO 8601 text (`new Date().toISOString()`), and booleans as `0` and `1`.
- Keep identifiers lower case and unquoted.
- `INTEGER PRIMARY KEY` makes an automatically numbered key in SQLite. The identity column of another database is spelled differently, so keep key
  definitions in migration files, where a different provider's version of the file can differ.
- SQLite lets a column hold a value of another type than it declares; most other databases do not. Store what you declare.

## In tests

A test opens its own database in memory, with the same migrations as production, and closes it:

```ts
import { afterEach, beforeEach, expect, test } from 'vitest'
import { openDb } from 'acrylblends/db/sqlite'
import { notesStore } from './db.ts'

let close: () => Promise<void>
let store: ReturnType<typeof notesStore>

beforeEach(async () => {
  const opened = await openDb({ path: ':memory:', migrations: 'migrations' })
  close = opened.close
  store = notesStore(opened.db)
})
afterEach(() => close())

test('a new store has no notes', async () => {
  expect(await store.titles(1)).toEqual([])
})
```

## In production

Open the database once at start, serve, and close it when the process is told to stop, after the server has stopped taking requests:

```ts
import { serve } from 'acrylblends/node-server'
import { openDb } from 'acrylblends/db/sqlite'
import { createApp } from './app.ts'

const { db, close } = await openDb({ path: process.env.DATABASE_FILE ?? 'data/app.sqlite', migrations: 'migrations' })
const server = serve({ fetch: createApp(db).fetch, port: Number(process.env.PORT ?? 3000) })

process.once('SIGTERM', async () => {
  server.close()
  await close()
})
```

`close` waits for the calls and the transaction that are running, flushes the write-ahead log into the main file, and releases the file, so a
copy of `data/app.sqlite` made afterwards is complete. Keep the file on a disk that outlives a deploy; on a host with only an ephemeral disk the
data goes with the machine.

## Why the database is opened in one place

Only one file of an app opens the database: the **opener** (`src/db.ts` in the templates). Every other file receives a `Db` as an argument and
imports its type from `acrylblends/db`. Nothing outside the opener imports `node:sqlite`, `pg`, `postgres`, `@electric-sql/pglite` or another
driver, or `acrylblends/db/sqlite` itself.

Why it matters:

- **Changing the database is one file.** Moving from SQLite to Postgres changes what the opener calls, and no route, store or test.
- **A test opens its own database.** Code that opens a database by itself cannot be given an in-memory one, and a test that reaches the real file
  breaks the next one.
- **There is one place to close it.** The code that opened a database closes it; the port has no `close`, so a route cannot do it by mistake.
- **An agent that adds a feature keeps the shape.** A coding agent asked for "tags" writes a migration and a store function, and has no reason to
  reach for a driver when the interface is in front of it.

The rule is checked, not hoped for. The app names its opener once, in `package.json`:

```json
{
  "acryl": { "opener": "src/db.ts" }
}
```

`acrylblends check-deps` reads every `.ts`, `.tsx` and `.js` file in `src/`, `test/`, `tests/` and `extensions/`, and fails when a file other than
the opener imports a database driver, an opener such as `acrylblends/db/sqlite` or `acryl-db-sqlite`, or (outside `src/plugins/desktop`) `electron`.
It names the file and the line:

```
src/routes.ts:3: "node:sqlite" is a database driver; take a Db (import type { Db } from "acrylblends/db") as an argument and let src/db.ts open the database
```

The `notes` and `chat` templates run it in `npm test` and `npm run check`. List more than one opener as an array (`"opener": ["src/db.ts", "src/app.ts"]`).
In a Blend app, `acrylblends add db` declares `src/app.ts`, where the provider is mounted, and a plugin that declares `inject: ['db']` must not import
`acryl-db-sqlite`: it receives `ctx.db`.

## In a Cordis app

An ACRYL app gets the same interface as a service. The `acryl-db-sqlite` plugin row opens the file (by default `data.sqlite` in the app home),
applies the `migrations` folder, and provides `db`; a plugin declares `inject: ['db']` and imports the types only:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-db'

export const name = 'notes'
export const inject = ['db']

export function apply(ctx: Context) {
  void ctx.db.run('INSERT INTO notes (title) VALUES (?)', 'first')
}
```

The plugin never imports a driver, so replacing the SQLite row by another provider is a change to the configuration.
