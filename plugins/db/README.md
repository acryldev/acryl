# acryl-db

The `db` port: the relational database app code sees, whichever provider serves it. Code depends on the port, never on a driver, so the
provider (`acryl-db-sqlite` today, Postgres next) can change without touching it.

Plain code (an acrylblends app, no Cordis) opens a database with a provider's `openDb`:

```ts
import { openDb } from 'acryl-db-sqlite/open'

const { db, close } = await openDb({ path: 'data/app.sqlite', migrations: new URL('./migrations/', import.meta.url) })
await db.run('INSERT INTO notes (body) VALUES (?)', 'first')
await close()
```

A Cordis plugin declares `inject: ['db']` and gets `ctx.db` from the provider row; `acryl-db/cordis` adds the type:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-db/cordis'

export const name = 'notes'
export const inject = ['db']

export function apply(ctx: Context) {
  void ctx.db.run('INSERT INTO notes (body) VALUES (?)', 'first')
}
```

The root entry imports nothing from Cordis, at runtime or in its types; Cordis is an optional peer dependency, needed only for
`acryl-db/cordis`.

- `exec(sql)` runs SQL text without bindings and may hold several statements; `run`, `get` and `all` run one statement with positional
  bindings, and `run` resolves `{ changes }`.
- `transaction(work)` hands `work` a handle; all of its work goes through that handle. Other calls and transactions wait until it settles.
  A rejected `work` rolls back and rejects with its own error. The handle is dead once the transaction settles.
- No `close`: the provider row owns the connection and closes it when it unloads.

## Migrations

A provider applies an app's migrations on start from a folder of numbered SQL files, `001-notes.sql`, `002-tags.sql`, ..., numbered from 1
without gaps. Each file is one migration. Pending migrations run in one transaction, so a failure leaves the database as it was. The version
lives in the `_migrations` table. A database whose version is newer than the files refuses to start.

## Conformance

Every provider passes the same suite, from its own tests:

```ts
import { describeDbConformance } from 'acryl-db/conformance'

describeDbConformance('my-provider', async () => {
  return openFreshDatabase() // { db, close }, as openDb resolves
})
```

The suite uses Vitest (an optional peer dependency) and only portable SQL.

The SQL facade under `src/facade` is ported from pi's chord package (MIT); `provenance.json` records the source commit and every change.
