# Spec 049 - plan

The slices are in `spec.md`. This file holds each slice's Cordis mini-design, written before its code.

## Slice 1 - the `db` port and `acryl-db-sqlite`

Source: pi's `packages/chord/src/sqlite/` at `d5b3de22d0e24a3e9c38a9410d3329b099717283` (2026-10-25, MIT). Ported:
- `database.ts`, `migrations.ts` and `schema.ts`, into the port;
- `node.ts`, into the provider;
- the tests `node.test.ts` and `migrations.test.ts`.

The ported files keep the upstream formatting, so `scripts/verify-port.mjs` can re-derive them, and every change beyond the mechanical
ones is a deviation with its reason in `provenance.json`. Not ported: `cloudflare.ts` and its test. That is a host adapter, and it comes
with the hosting adapters after slice 3.

1. **Capability and plugin boundary.** Two packages under `plugins/`, so app code depends on the port and never on a driver:
   - `acryl-db`, the port: the `Db` types, the migration runner and the numbered-file loader, and the conformance suite (subpath
     `acryl-db/conformance`). It imports no driver. An app plugin imports its types only.
   - `acryl-db-sqlite`, the provider: a function plugin that opens one `node:sqlite` file and provides `db`. It is its own plugin because
     replacing it (`acryl-db-postgres`, another file) must not touch app code.
2. **Provides and consumes.**
   - Provides `db: Db`, chord's executor shape: `exec(sql)`, `run(sql, ...params)`, `get`, `all`, and `transaction(work)`, whose `work`
     receives a `DbExecutor`.
   - Consumes `appInstance` with `ctx.get()`, optionally, for the default file `<app home>/data.sqlite`. Without it (a plain framework
     app), `path` is required, and the fiber fails with a message that says so. It never calls `homedir()`.
   - Deviations from chord:
     - The names are spec 049's (`Db`, `DbExecutor`, `SqlValue`), because the port also serves Postgres.
     - `run` resolves `{ changes }` where chord resolves `void`. Both drivers report it, and an update-if-unchanged needs it.
     - `close` is not on the port. The provider owns the connection, so no app plugin can close the database another plugin uses.
   - Deviation from spec 049's sketch: the transaction handle is a `DbExecutor`, not a `Db`. chord's contract makes a database call from
     inside a transaction wait for that transaction, so a nested `transaction` on the handle could only deadlock.
3. **Effects and disposal.**
   - One `ctx.effect()` does four things: opens the file with chord's settings (WAL, `synchronous = NORMAL`, a 5 s busy timeout), applies
     the migrations, provides `db`, and returns the disposer.
   - The disposer first withdraws `db`, so consumers unload and stop calling. Then it closes the database. chord's `close` is queued
     behind running operations and transactions, checkpoints the WAL with TRUNCATE, and closes the file.
   - A failed migration closes the file before the fiber fails. A call through a handle after close rejects.
4. **Configuration and composition.**
   - Config, validated by its Schemastery schema (`Config`, as `acryl-node-server` does):
     - `path?: string`;
     - `migrations?: string`, a folder of `NNN-name.sql` files numbered contiguously from 1, relative to the app's base URL;
     - `busyTimeoutMs?: number`;
     - `walAutoCheckpointPages?: number`.
   - Loader row id `acryl-db-sqlite`, the package name.
   - A second row providing `db`, or a changed `path`, reactivates consumers through `inject: ['db']`.
   - The migration version lives in a `_migrations` table. That is chord's single-row version table, named as spec 049 asks.
5. **Events and durability.** No events. The file is the durable state.
   - The migration runner commits the bootstrap and every pending migration in one transaction, or nothing (a ported chord test).
   - Its SQL is portable to Postgres, recorded as a deviation: no `STRICT` table, `ON CONFLICT DO NOTHING` for SQLite's
     `INSERT OR IGNORE`, and the version written as a validated integer rather than a `?` binding.
6. **Verification.**
   - chord's tests, ported with provenance.
   - The `db` conformance suite (`describeDbConformance`), run against `acryl-db-sqlite` now and unchanged against Postgres in slice 2.
     It covers:
     - value round-trips (null, integer, bigint, real, text, blob) and `changes`;
     - call-order queueing;
     - a transaction queueing other calls until it settles;
     - rollback with the callback's error, and a stale handle rejecting;
     - migrations applied once, in order, atomically, and a schema newer than the code refused.
   - A real Loader test:
     - the row goes ACTIVE, and a consumer with `inject: ['db']` waits PENDING until a provider exists;
     - a `path` change reactivates the consumer on the new file;
     - disposal closes the file (it reopens, and the WAL is truncated);
     - repeated mounts leave nothing open.
   - Gate: the suite on Node 22 and 24, on macOS, Linux and Windows, in a workflow of its own (`Data`, path-filtered to the data
     packages).
   - Tooling: `scripts/verify-port.mjs` learns a second upstream project. Its package list gains the two packages, and a package records
     its source project in `provenance.json`, so the router's renames apply only to the router's ports.

### Slice 1 addendum - plain entries (2026-10-26, coordinator, for Blends' slice 4)

create-acrylblends templates are plain acrylblends apps without Cordis, so they cannot `inject: ['db']`.
- `acryl-db`'s root entry imports nothing from Cordis, at runtime or in its types. The `ctx.db` augmentation moved to `acryl-db/cordis`,
  and Cordis became an optional peer dependency.
- `acryl-db-sqlite/open` exports `openDb({ path, migrations?, busyTimeoutMs?, walAutoCheckpointPages? })`, which resolves
  `{ db, close }`. The Cordis plugin is a thin wrapper over it: one code path.
- Tests:
  - the conformance suite runs through `openDb`;
  - close releases the file;
  - a failed migration closes the file and leaves it unchanged;
  - misnumbered files are refused before anything is opened;
  - the plain entries and everything they import, built JavaScript and declarations, name no Cordis or Schemastery module.
- The conformance suite allows a provider that creates `_migrations` when it opens: the version must then read 0.
- Blends maps these as `acrylblends/db` (`acryl-db`) and `acrylblends/db/sqlite` (`acryl-db-sqlite/open`). Slice 2's
  `acryl-db-postgres` gets the same `openDb` shape.
- The facts Blends' templates rely on, each with a test (coordinator, 2026-10-26):
  - `openDb` resolves `{ db, close }`;
  - `:memory:` works;
  - the parent folder is created;
  - `PRAGMA foreign_keys = ON` is set, so `ON DELETE CASCADE` works;
  - `INSERT ... RETURNING` answers through `get`;
  - the plain entry exports `type Db`, `DbExecutor` and `SqlValue`.
- The conformance suite now covers foreign keys (a cascade, and an orphan insert refused) and `RETURNING`, so Postgres in slice 2 must
  meet them too. Slice 2 also adds `?` inside a string literal and inside a comment, both left untranslated.

## Slice 2 - `acryl-db-postgres`, a network Postgres provider (2026-10-26)

The provider serves a real Postgres or Supabase reached through a connection URL (`DATABASE_URL`). PGlite is a devDependency only: the
conformance suite runs against PGlite through its socket server (`@electric-sql/pglite-socket`), so CI needs no server and the provider is
tested over the wire, through the driver it ships with.

1. **Capability and plugin boundary.** One package, `plugins/acryl-db-postgres`, the same shape as the SQLite provider:
   - `acryl-db-postgres/open` exports `openDb({ url, migrations? })`, which resolves `{ db, close }` and imports nothing from Cordis;
   - the root export is the Cordis plugin, a thin wrapper over `openDb`.
   Replacing `acryl-db-sqlite` with this row changes no app code.
2. **Provides and consumes.** Provides `db`. Consumes nothing at runtime beyond its config.
   - The driver is `pg` (MIT), not `postgres` (Unlicense), for these reasons:
     - its type parsers are per pool, so normalizing values mutates no process-wide state another package shares;
     - its extended-protocol statements are unnamed, so they work behind Supabase's transaction-mode pooler;
     - a query without values runs in the simple protocol, which allows `exec`'s several statements;
     - it has the widest use and the longest record of the two.
3. **Effects and disposal.**
   - One connection pool with at most one connection (`pg.Pool`, `max: 1`). The port's contract serializes everything: other calls wait
     for an active transaction, and calls run in call order. One connection is the faithful implementation, and the pool reconnects after
     a dropped connection.
   - Calls go through one promise chain in call order. A transaction holds the chain from `BEGIN` until `COMMIT` or `ROLLBACK`.
   - A rejected callback rolls back and rejects with its own error. A failed rollback rejects with an `AggregateError`. A handle used after
     its transaction settles rejects.
   - `close` waits for the chain, then ends the pool. A second `close` does nothing. The plugin's disposer withdraws `db` first, then
     closes.
4. **Configuration and composition.**
   - `openDb` options:
     - `url`, a connection string;
     - `migrations`, a path or a file URL;
     - optional `pool` settings left at their defaults.
   - The plugin config is `url` and `migrations`. `url` defaults to `DATABASE_URL` from the process environment, and the row fails with
     a message naming `url` and `DATABASE_URL` when neither is set. Relative `migrations` resolve from the Loader's base URL.
   - Row id `acryl-db-postgres`, the package name.
5. **Events and durability.** No events. The database is the durable state.
   - Migrations go through `acryl-db`'s portable `applyMigrations`, one transaction for all pending ones (Postgres has transactional DDL).
6. **Placeholders and values.**
   - `?` becomes `$1..$n` through a small scanner, not a regex. The scanner leaves alone:
     - single-quoted strings (with `''`), `E'...'` strings (with backslash escapes);
     - double-quoted identifiers;
     - dollar-quoted strings (`$$...$$`, `$tag$...$tag$`);
     - `--` line comments and nested `/* */` comments.
   - A `?` outside those is always a binding, so the jsonb operators `?`, `?|` and `?&` are not available through bindings. Their
     functions (`jsonb_exists`, `jsonb_exists_any`, `jsonb_exists_all`) are; the README says so.
   - The number of placeholders must equal the number of values, or the call rejects naming both counts.
   - `exec(sql)` takes no values and is sent as is.
   - Values in: a `bigint` is sent as its decimal text, a `Uint8Array` as bytes.
   - Values out:
     - `int8` becomes a number when it is a safe integer, else a `bigint` (as `count(*)` does);
     - `bytea` becomes a plain `Uint8Array`;
     - `float8` and `int2/4` become numbers;
     - `numeric` stays text, since it is exact.
   - `run` resolves `{ changes: rowCount }`.
7. **Verification.**
   - The conformance suite on PGlite through the socket server, plus the cases this slice adds to it:
     - a `?` inside a string literal, an identifier and a comment, all left untranslated (portable SQL, so SQLite runs them too);
     - a placeholder count mismatch rejected.
   - The scanner's own tests for the Postgres-only syntax (`E'..'`, dollar quotes, nested comments).
   - `openDb`'s tests:
     - close releases the connection (the server's connection count returns to 0);
     - a failed migration leaves the schema unchanged.
   - A real Loader test with a consumer that injects `db`.
   - The suite once by hand against a real server through `ACRYL_DB_POSTGRES_URL`. Each case runs in its own schema (`search_path` in the
     connection options), dropped afterwards, so a real database's `public` schema is never touched.
   - The Data workflow gains the package on all six legs.

## Slice 3 - `kv` and the JSON provider (2026-10-26, Blends; moved from Fork3)

`kv` is for an app too small for SQL: named JSON documents. It follows `acryl-db`'s pattern exactly: a port with a plain root entry, the Cordis
types in a subpath, a conformance suite, and per provider one plain `openKv` that the Cordis plugin wraps. Nothing here is ported from pi:
the contract is spec 049's, the code is ours.

1. **Capability and plugin boundary.** Three packages under `plugins/`:
   - `acryl-kv`, the port: the `Kv` types, key and value checks, `copyKv`, and the conformance suite (`acryl-kv/conformance`). Its root entry
     imports no driver and nothing from Cordis; the `ctx.kv` type is `acryl-kv/cordis`.
   - `acryl-kv-json`, a provider: `openKv({ path })` over one JSON file, and the Cordis plugin around it.
   - `acryl-kv-db`, a provider over the `db` port (SQLite today, Postgres after slice 2): `kvOnDb(db)` and the Cordis plugin around it, which
     injects `db` and provides `kv`. A third package, so replacing the file by SQL is a different row and an app that grows into SQL keeps its data.
2. **Provides and consumes.**
   - Both plugins provide `kv: Kv`. `acryl-kv-json` consumes `appInstance` through `ctx.get` (optional, read as `{ home: string }` and declared as
     no type), for the default file `<app home>/kv.json`; without one `path` is required and the fiber fails with a message that says so.
   - `acryl-kv-db` injects `db` and nothing else. Its table is `kv` (`key TEXT PRIMARY KEY, value TEXT NOT NULL`), created with
     `CREATE TABLE IF NOT EXISTS` on first use, so it needs no migration of the app's.
   - Two rows providing `kv` conflict like any two providers of one service; the app picks one.
3. **The port.** Every call returns a promise; values are JSON.
   - `get(key)` resolves the value or `undefined`; `set(key, value)`; `delete(key)` (a missing key is not an error); `list(prefix?)` resolves
     the keys, sorted by code point, that start with the prefix (all of them when there is none).
   - `update(key, change)` is atomic: `change(current)` is synchronous, receives the current value (`undefined` when missing) and returns the
     new one, and no other write to that key happens between the read and the write. A `change` that throws, or returns something that is not
     JSON, leaves the value as it was and rejects with its error.
   - A key is a non-empty string. A value must survive `JSON.stringify` unchanged in meaning: `undefined`, functions, symbols, bigints and
     non-finite numbers are refused with a `TypeError` before anything is written. A value read back is a copy: changing it changes nothing stored.
   - No `close` on the port: the opener owns it, as with `db`.
4. **Effects and disposal.**
   - JSON provider: the state is one in-memory map loaded at open. Each write queues behind the previous ones and persists the whole map:
     serialize to `<path>.<pid>.<n>.tmp` in the same folder, flush it to disk, rename it over `<path>` (atomic), and flush the folder where the
     platform allows. The call resolves after the rename. A crash leaves the old file or the new one, never half of one; stray `.tmp` files from
     a crash are removed at the next open. A file that exists but does not parse is an error naming the path; the provider never starts over
     an unreadable file.
   - `close()` waits for the queued writes, then later calls reject. Calling it again does nothing.
   - The Cordis plugin: one `ctx.effect()` opens, provides `kv` and returns the disposer; the disposer withdraws `kv` first (consumers unload),
     then closes. Disabling and enabling a row leaves no `.tmp` file and nothing open.
   - `acryl-kv-db`: no connection of its own. The plugin waits PENDING until `db` exists and withdraws `kv` when `db` goes.
5. **Durability and limits.** One process owns a JSON file (no file lock: two writers would overwrite each other, which the guide says). The whole file is rewritten
   on every write, so it suits thousands of small values, not megabytes of data; the guide points at `db` for those. `kv` over `db` is
   transactional: `update` reads and writes in one `db.transaction`, `list` uses `substr(key, 1, n) = ?` (no `LIKE`, so `%`, `_` and case need no escaping).
   Postgres needs `SELECT ... FOR UPDATE` for the same guarantee; that comes with its provider in slice 2.
6. **Import.** `copyKv(source, target, { overwrite })` in `acryl-kv` copies every key from one `Kv` to another, refusing to overwrite unless asked,
   and returns the counts. It is the whole of "one import command": the JSON file opened with `openKv` is the source, `kvOnDb` the target.
   Blends puts the command line on it (`acrylblends kv import`).
7. **Verification.**
   - `describeKvConformance`, run unchanged on `acryl-kv-json` and `acryl-kv-db` (on SQLite files): JSON round trips (null, numbers, strings
     with unicode, nested objects and arrays), missing keys, overwrite, delete, `list` order by code point (astral characters after BMP ones), prefixes
     holding `%`, `_` and mixed case, an empty prefix, fifty concurrent `update`s counting to exactly fifty, `update` that throws or returns a
     non-JSON value leaving the value, bad keys and values refused, returned values are copies, a 1 MB value, and persistence across close and reopen.
   - A crash test for the JSON file: a child process writes two keys that must differ by at most one step, and is killed with SIGKILL at random moments, forty times;
     after every kill the file parses, both keys exist and the invariant holds, and no write ever leaves the file unreadable.
   - Real Loader tests for both plugins: PENDING until the service they need exists; a changed `path` moves consumers; ten disable and enable
     cycles keep the data and leave no `.tmp` file and nothing open (the folder can be removed at once, on Windows too); a corrupt file fails the row without touching it.
   - Gate: the `Data` workflow runs all three packages on Linux, macOS and Windows, Node 22 and 24.
