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
   - **What covers what.** The Data workflow runs the suite on PGlite only. PGlite ignores the startup `search_path` (every socket
     connection shares one session), so the schema-per-case mode, the one a real server or Supabase gets, is proved by hand only. Do not
     read a green Data run as covering it.
   - **The hand run, 2026-10-26.** PostgreSQL 17.10 (the `@embedded-postgres/darwin-arm64` 17.10.0-beta.17 binaries, run from a scratch folder
     on 127.0.0.1:55433 with Unix sockets off, stopped by its PID and deleted afterwards):
     - 33 of 33 tests passed;
     - 22 cases ran in schema-per-case mode: conformance 15, `openDb` 5 and the Loader 2;
     - those cases created and dropped 23 schemas, since the first `openDb` case opens twice (a path and a file URL);
     - no schema was left behind;
     - the server's 4 ERROR lines are the failures the cases assert: the refused orphan insert, two broken migrations, and the read after
       the rolled-back one;
     - the other 11 tests need no server (the scanner 8, the import closure 1, "ships pg" 1, "no url" 1).

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

## Slice 9 - the door in every new app, safely (2026-10-27)

Scope (coordinator, 2026-10-27): the door is ported onto the framework's ports, with one implementation. A Cordis face for the
`acryl-app` template (`acrylblends init`, a `blend.yaml` app) is gated here. ACRYL's DSH Host keeps `acryl-agent-control` as a thin
adapter over the same core. The plain templates (`nodejs`, `notes`, `chat`) get no door until the owner decides whether the default
template becomes a Cordis app.

What exists:
- `plugins/acryl-agent-control` (spec 041). Its host already runs on `acryl-router`: the private routes, the secret check, the audit,
  the call channel and the refs.
- Four couplings keep it from running in a framework app:
  - the page channel is a WebSocket upgrade on DSH's `acrylWeb`;
  - the tools are registered on `acrylTools`, with approval through the harness's policy pipeline (`sandboxPolicy`, `approval`);
  - paths come from ACRYL's `appInstance`, which has `home` and `dshHome` (the framework's has `root` and `home`);
  - the page end is a DSH client plugin. The indicator is React on `@acryl/ui`. The driver (`client/driver/`, 700 lines) and
    `connection.ts` are DOM only.

1. **Capability and plugin boundary.**
   - A new plugin, `plugins/acryl-door`: the Door of the five nouns, the one implementation. It holds:
     - the host core: the channel, refs, audit, the secret and its connection file, the private routes, and the verbs;
     - its Cordis face for framework apps;
     - the page module (driver, channel client and a DOM-only indicator with the kill switch);
     - the operator client that `acryl control` runs.
   - Its dependencies are only `@deepseek-ai/cordis`, `acryl-router` and `acryl-loopback-http`. There is no DSH, no React and no
     `ws`.
   - acrylblends vendors it into its plugin library like `acryl-router`; the `acryl-app` template mounts it.
   - `acryl-agent-control` keeps its row id, config and tests. Its host becomes an adapter: `acrylTools` registration, the harness
     approval policy, workers and the MCP gateway, all calling `acryl-door`'s core. Its client keeps the React indicator and the audit
     section, and calls the shared driver and channel client.
   - The code moves (`git mv` where a file moves whole), so the 041 tests keep running against the moved code.
2. **Provides and consumes.** The framework face:
   - `inject: ['router', 'appInstance', 'nodeServer']`. `appInstance.root` is the app folder; `nodeServer.url` is the origin the page
     and the operator reach.
   - Optional through `ctx.get`:
     - `extensions` (the verbs `plugin add|remove|reload|list`: `install(folder)`, `remove(name)`, `reload()` and the list);
     - `tools` (the `agent` plugin's registry). Its tools are listed and called only when named in the allowlist `tools.expose`
       (empty by default). The door is never a second shell.
   - Provides `door`: `brief()`, `look()`, `act(request)` and the plugin verbs. The future built-in chat (slice 14) and MCP (slice 13)
     call it in process.
   - Routes, all under `/api/acryl-door`:
     - the page channel: `GET /channel`, an event stream of calls; `POST /channel/answer`. Both are guarded by the own-page rule
       (same origin, loopback);
     - `POST /verbs/:verb` and `GET /verbs`, for an operator on this machine presenting the secret.
   - The page channel moves from a WebSocket to server-sent events down and POST up. It is router-carried, so it needs no upgrade on
     any adapter, and it reuses `streamSSE` and `readSSE`. The DSH face moves to the same transport, so one channel remains, in a
     commit of its own that can be reverted alone.
   - The channel has a heartbeat: the Host sends a comment line every 15 s, and a page that hears nothing for 45 s drops the stream and
     reconnects with backoff. A page that loses the stream resumes on the next one, with a fresh `hello`. A call in flight when its
     page's stream drops settles at once as `disconnected`, never waiting for the 30 s timeout.
3. **Effects and disposal.** One `ctx.effect` owns everything, and releases it in reverse:
   - the channel: open streams end and pending calls settle as `unloaded`;
   - the audit file handle;
   - the connection file `<root>/.acryl/door.json` (`{ url, secret, pid }`, file mode 0600, folder 0700). It is written once the
     routes are mounted and removed on disposal, before the routes unmount, so a reader never finds a file naming routes that are
     gone. A restart rotates the secret.
   - A stale file (the `pid` is dead) is replaced at start, never trusted.
   - On Windows a file mode means nothing. There, `door.json` is protected by where it lives: the app folder in the user's profile,
     whose ACL gives access to that user, SYSTEM and Administrators only. The door does not widen it. An app folder outside the profile
     (another drive, a shared folder) is the user's choice, and the guide says so.
   - The audit goes to `<root>/.acryl/audit/`. Nothing is written outside `<root>/.acryl/`. The template's `.gitignore` lists
     `.acryl/` (Blends' line); the door also writes `<root>/.acryl/.gitignore` containing `*`, so the folder stays out of git even
     in an app whose `.gitignore` lacks the line.
4. **Configuration and composition.**
   - Row id `acryl-door`, after `acryl-node-server`, `extensions` and `tools` in `blend.yaml`.
   - Config, validated by Schemastery:
     - `approval: 'page' | 'none'`, default `page`. A mutating act shows the in-page "agent is driving" indicator with a kill switch,
       and the person at the page can stop it. The operator holding the secret is the user's own agent, as in 041's online channel,
       and every call is audited.
     - `tools.expose`: string[], default empty.
     - `enabled: boolean` (default true in development).
   - The page module is served at `/api/acryl-door/page.js` and added to a page by one script tag. The `acryl-app` template's page
     includes it (Blends).
   - Spec 049 open question 2 (the door off in production) stays the owner's. Until it is answered, the template turns it on for
     `npm run dev` only.
   - A second door row conflicts like any duplicate provider of `door`.
5. **Events and durability.**
   - No events. The audit is append-only JSONL, one line per call.
   - Nothing is replay-critical: a restart starts a new secret, empty refs, and a page that reconnects.
6. **Verification.**
   - The moved 041 suites (the channel, refs, audit, routes, secret and driver in jsdom) pass in `acryl-door`, and
     `acryl-agent-control`'s suites pass unchanged on the adapter.
   - Real Loader tests on the framework face:
     - PENDING until `nodeServer` exists;
     - `extensions` arriving and leaving adds and removes the plugin verbs, with no duplicate routes;
     - disposal removes `door.json` and ends open streams;
     - ten mount/unmount cycles leave no file, timer or listener.
   - Review additions, each a test:
     - a page whose stream drops reconnects and answers the next call; a call in flight when the stream drops rejects with
       `disconnected` within a second;
     - `GET /channel` and `POST /channel/answer` refuse another origin, including another loopback port, and a request with no origin;
     - the kill switch on the DOM indicator stops an act in progress: a `wait` that is running rejects with `killed`, and later acts are
       refused until the person turns it back on;
     - on the Windows runner, `door.json` exists while the app runs, its ACL names no group beyond the user, SYSTEM and Administrators
       (read with `icacls`), and it is gone after disposal.
   - The DSH transport commit is gated by the suites and a live check of the DSH door in Desktop and Web, each in an isolated home through
     `scripts/live-run.mjs`: a snapshot and a click through `acryl control` reach the page, and a reload of the page reconnects.
   - **The gate:**
     - in a scratch HOME, a fresh `acrylblends init` app with the template's door row answers `acryl control tool list` with the
       door's verbs;
     - `look` returns the page's snapshot from a real browser;
     - `git init && git add -A` in the app stages nothing under `.acryl/`, and no file anywhere in the app holds the secret.
   - The operator client is part of `acryl-door`. Slice 10 writes `<root>/.acryl/bin/acryl` (and `acryl.cmd`), which runs it against
     this folder's `door.json`. Until then the gate runs the client by path from the app folder.

Coordination: Blends owns the template row, the script tag in the template page, the `.gitignore` line, vendoring `acryl-door`
into the library, and the skill text (verbs sent after this design is accepted).

## Slice 17 - one home for the framework: the acrylblends repository (2026-10-27, Blends; execute after slice 9 lands)

Owner, 2026-10-27: the framework's home is acrylblends for now, `acryl` later. Today the source is here and the acrylblends repository holds a
*copy* (`scripts/sync-framework.mjs`, `framework.json`, `vendor-framework-package.mjs`, `verify-framework-sync.mjs`); every release starts with
a pack, a vendor and a drift check. Slice 17 removes the copy step: the source moves, with its history, and ACRYL depends on what is published.

### Which packages move

| Package (today's name) | From (ACRYL) | To (acrylblends) | Note |
| --- | --- | --- | --- |
| `acryl-router`, `acryl-router-http` | `plugins/` | `plugins/` | the router, the Cordis plugin that serves it |
| `acryl-node-server` | `plugins/` | `plugins/` | includes client modules and `read-sse` |
| `acryl-state` | `plugins/` | `plugins/` | |
| `acryl-db`, `acryl-db-sqlite` | `plugins/` | `plugins/` | `acryl-db-postgres` does NOT move: it stays an optional plugin in ACRYL |
| `acryl-kv`, `acryl-kv-json`, `acryl-kv-db` | `plugins/` | `plugins/` | |
| the door (`acryl-door`, slice 9) | `plugins/` | `plugins/` | its two dependencies, `acryl-control` and `acryl-loopback-http`, move with it, or the door is published with them as peers: decided at execution by what else uses them (see open questions) |
| the framework package build | `distribution/acrylblends-framework` | `packages/framework` | what builds the `lib` of the `acrylblends` package |
| the framework docs | `docs/framework` | `docs/framework` | the source of the pages every new app carries |

`plugins/` in acrylblends is already the library `acrylblends add` copies from. After the move the `acryl-*` folders there are the **source**, not a vendored copy
(their `upstream.json`, `UPSTREAM.md`, `framework.json` and the `testsNotRun` list go away). Specs, the IDE (`apps/`), the Host, DSH and everything that is not the
framework stay in ACRYL.

### How the history moves

1. Freeze: the coordinator stops landing changes under the moving paths in ACRYL (a day, announced in the thread). The freeze hash is H.
2. In a scratch clone of ACRYL at H: `git filter-repo` with one `--path` per moved folder (and `--path-rename` where the destination differs, e.g.
   `distribution/acrylblends-framework/` to `packages/framework/`). Every commit that touched a moved path stays, with its author and date; others disappear.
3. In acrylblends, on a branch: remove the vendored copies of those folders in one commit, then `git remote add acryl-history <scratch clone>`,
   `git fetch acryl-history` and `git merge --allow-unrelated-histories acryl-history/main`. The merge commit says "moved with history from acryldev/acryl at H".
   Because the vendored copies were removed first, the merge has no add/add conflicts. The tree after the merge equals H for the moved paths (checked by a diff against H).
4. Delete the copy machinery (`scripts/sync-framework.mjs`, `vendor-framework-package.mjs`, `verify-framework-sync.mjs`, `framework.json`, the `PLUGINS` table) and its
   tests, in a second commit, so the move itself is a pure history operation.
5. `git filter-repo` is not installed here; the step needs `brew install git-filter-repo` (or `pip install git-filter-repo`). No other tool is needed.

### How ACRYL consumes them

- ACRYL's `workspace:*` dependencies on the moved packages become the published version range (`^0.8.0` for the first train). pnpm resolves them from the registry; there is no
  checkout of acrylblends beside ACRYL in CI.
- To work on both at once, a developer uses `pnpm.overrides` with `link:../acrylblends/plugins/<name>` in a local, uncommitted file (documented in ACRYL's CONTRIBUTING); nothing
  committed points at a path outside the repository.
- Every push to acrylblends `main` publishes the `next` dist-tag (`0.8.0-next.<run>`), so ACRYL can test unreleased framework work from the registry without a copy.
- ACRYL tests that reach into the moved folders by path (`plugins/acryl-router/tests/...` imported from elsewhere, scripts that read `plugins/acryl-node-server/src/...`) are
  rewritten to import the package. The count is taken at execution with `grep` over the freeze commit; the gate below proves none is left.

### Publishing

- One version train: every moved package and `acrylblends`/`create-acrylblends` are released at the same version number (lockstep), by one workflow in acrylblends that builds,
  packs, installs from the tarballs in a scratch project, and publishes. Today's per-package `0.1.0` is replaced by the train's number at the first release.
- Names: the unscoped names (`acryl-router`, `acryl-db`, ...) are free on npm today (checked 2026-10-27: 404). Keeping them avoids renaming churn in ACRYL. A scope (`@acrylblends/*`)
  needs an npm organisation the owner would create: an owner decision (open question 1). Either way `acrylblends` stays the one package users install.
- Publishing uses the existing token flow; trusted publishing stays as the written plan (`specs/019-trusted-publishing`), unchanged by this slice.

### CI on three operating systems

The acrylblends workflow `ci.yml` today runs `pnpm run check` on Ubuntu with Node 22 and 24. After the move it gains a matrix of Ubuntu, Windows and macOS (Node 22 and 24 on Ubuntu, 24 on the others), with these jobs:

| Job | Runs | OS |
| --- | --- | --- |
| `check` | lint, typecheck, build, package tests (router, node server, state, db, kv, door) | Ubuntu, Windows, macOS |
| `data` | the `db` and `kv` conformance suites and the kv-json crash test (SIGKILL, 40 rounds) | Ubuntu, Windows |
| `desktop` | the Electron shell test under `xvfb` | Ubuntu |
| `scaffold` | `verify:scaffolder`, `verify:tarball`: create every template from the tarballs, run its tests and `check-deps` | Ubuntu, Windows |
| `release` | on a tag: build once, pack, install in a scratch project, publish | Ubuntu |

These are ACRYL's `ci.yml`, `data.yml`, `windows.yml` and `desktop-linux.yml` brought over, so the 3-OS coverage the moved packages have today does not shrink. ACRYL keeps a job that
installs the published `next` packages and runs the IDE's own gates (`apps/acryl-desktop`, `apps/acryl-cli`).

### Order, gate, rollback

1. Slice 9 lands (the door exists as a package in ACRYL). 2. Freeze and move (above). 3. acrylblends CI green on the three systems. 4. Release the first train (`0.8.0`) from
acrylblends alone. 5. In ACRYL, one branch: delete the moved folders, point the dependents at `^0.8.0`, fix path imports, run ACRYL's four workflows. 6. Land; lift the freeze.
**Gate:** a release is built and published from the acrylblends repository only, and ACRYL's workflows pass on the published packages. **Rollback:** ACRYL keeps its folders until step 5
lands, so until then nothing depends on the move; after step 5 a revert of that one ACRYL commit restores them.

### Open questions for the owner and the coordinator

1. Unscoped names (`acryl-router`) or the `@acrylblends/*` scope? Recommendation: unscoped now (free, no churn), scope later only if a name is taken.
2. `acryl-control` and `acryl-loopback-http` (the door's dependencies): move with the door, or stay in ACRYL and be published from there as peers? Recommendation: move them, because the door is
   Cordis-only framework and a peer published from the IDE repository would bring back the dependency from the framework onto the IDE.
3. Lockstep versions for all packages, or independent ones? Recommendation: lockstep until the first external consumer asks for independence.
4. Who owns the freeze announcement: the coordinator. Slice 9 must have landed, and no framework slice may be in flight on the moved paths.
