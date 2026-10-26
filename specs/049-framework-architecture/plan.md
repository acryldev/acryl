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
