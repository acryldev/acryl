# acryl-db

The `db` port: the relational database an app plugin sees, whichever provider serves it. An app plugin declares `inject: ['db']`, imports
types from here, and never imports a driver, so the provider (`acryl-db-sqlite` today, Postgres next) can change without touching it.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-db'

export const name = 'notes'
export const inject = ['db']

export function apply(ctx: Context) {
  // `?` placeholders on every provider.
  void ctx.db.run('INSERT INTO notes (body) VALUES (?)', 'first')
}
```

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
  const db = await openFreshDatabase()
  return { db, close: () => db.close() }
})
```

The suite uses Vitest (an optional peer dependency) and only portable SQL.

The SQL facade under `src/facade` is ported from pi's chord package (MIT); `provenance.json` records the source commit and every change.
