# acryl-db-postgres

The Postgres provider of the [`db` port](../acryl-db/README.md), for a Postgres or Supabase server reached through a connection string.
It ships the `pg` driver. App code depends on the port only, so moving from `acryl-db-sqlite` to this provider changes how the database is
opened, not the code that uses it. It is an optional plugin: not part of the `acrylblends` package or its templates (spec 049, 2026-10-27).

Without Cordis (an acrylblends app):

```ts
import { openDb } from 'acryl-db-postgres/open'

const { db, close } = await openDb({ url: process.env.DATABASE_URL!, migrations: new URL('./migrations/', import.meta.url) })
```

As a Cordis row, `url` defaults to the `DATABASE_URL` environment variable, and relative `migrations` resolve from the app:

```yaml
- id: acryl-db-postgres
  name: acryl-db-postgres
  config:
    migrations: migrations
```

- The same port as SQLite:
  - `?` placeholders;
  - `run` resolves `{ changes }`;
  - calls run in call order, and other calls wait for an active transaction;
  - foreign keys and `INSERT ... RETURNING` work;
  - migrations are numbered SQL files applied in one transaction, versioned in `_migrations`.
- A `?` inside a string (`'...'`, `E'...'`, `$$...$$`), a quoted identifier or a comment is text. Every other `?` is a binding. The jsonb
  operators `?`, `?|` and `?&` can therefore not be written; use `jsonb_exists`, `jsonb_exists_any` and `jsonb_exists_all`.
- Values:
  - `int8` comes back as a number, or as a `bigint` beyond the safe integer range;
  - `bytea` comes back as a `Uint8Array`;
  - `numeric` stays exact text.
- One connection: the port's contract serializes calls, and the pool reconnects after a dropped connection. With Supabase, use the
  connection pooler's URL or the direct one; statements are unnamed, so the transaction-mode pooler works.

`acryl-db-postgres/dialect` holds the Postgres dialect code: the `?` translation, and the check that a statement got as many values as it
binds. It imports nothing, so `acryl-db-pglite`, the embedded provider, shares it without loading `pg`.

The tests run against PGlite (in memory) behind its socket server, so they need no Postgres installed but still go through `pg` over the
network. To run them against a real server, set `ACRYL_DB_POSTGRES_URL`. Each case then uses a schema of its own, dropped afterwards.
PGlite is a development dependency only.
