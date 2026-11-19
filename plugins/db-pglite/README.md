# acryl-db-pglite

The embedded Postgres provider of the [`db` port](https://github.com/acrylblends/acrylblends/tree/main/plugins/acryl-db/README.md) (`acrylblends/db`): [PGlite](https://pglite.dev), Postgres compiled to WebAssembly,
in the app's own process, with its database in one folder. It sits between SQLite and a Postgres server. It is the same Postgres as
[`acryl-db-postgres`](../acryl-db-postgres/README.md), and shares that provider's `?` translation (`acryl-db-postgres/dialect`), but
needs no server. App code depends on the port only, so moving between `acrylblends/cordis/db-sqlite`, this provider and `acryl-db-postgres` changes
how the database is opened, not the code that uses it. It is an optional plugin, not part of `acrylblends` or its templates (spec 049
slice 2b).

Without Cordis (an acrylblends app):

```ts
import { openDb } from 'acryl-db-pglite/open'

const { db, close } = await openDb({ dataDir: './data/pglite', migrations: new URL('./migrations/', import.meta.url) })
```

As a Cordis row, `dataDir` defaults to `pglite` in the ACRYL app home. Relative `dataDir` and `migrations` resolve from the app:

```yaml
- id: acryl-db-pglite
  name: acryl-db-pglite
  config:
    migrations: migrations
```

- **The same port as the other providers:**
  - `?` placeholders;
  - `run` resolves `{ changes }`;
  - calls run in call order, and other calls wait for an active transaction;
  - foreign keys and `INSERT ... RETURNING` work;
  - migrations are numbered SQL files applied in one transaction, versioned in `_migrations`.

  The `?` rules and the values are those of `acryl-db-postgres`:
  - `int8` comes back as a number, or as a `bigint` beyond the safe range;
  - `bytea` comes back as a `Uint8Array`;
  - `numeric` stays exact text.
- **One process per folder.** PGlite does not lock its folder, and two processes writing one cluster corrupt it, so the provider holds
  `acryl-db-pglite.lock` in the folder (it records the holder's pid):
  - A second open of the same folder fails with "already open in process N" (or "in this process").
  - A lock left by a process that is gone is taken over.
  - `close` removes the lock.
- **Closing writes the folder out.** `close` waits for the running calls, then closes PGlite. The next open, in this process or another,
  reads what was written.
- **`dataDir: 'memory://'`** (`IN_MEMORY`) keeps the database in memory until `close`.
- **Electron.** It runs in Electron's main process: `scripts/electron-main-check.mjs` opens, writes, closes and reopens a folder there. CI
  runs it with Desktop's Electron on Linux, under xvfb, and on Windows.

The first open of a new folder runs Postgres's `initdb`, about a second (several on a loaded machine). Later opens skip it.
