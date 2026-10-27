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

## Slice 2b - `acryl-db-pglite`, embedded Postgres (2026-10-27, Fork3)

Mini-design:

1. Boundary: a plugin of its own, `acryl-db-pglite`, a third provider of `db`. It is chosen per app like the other two, and replacing
   `acryl-db-sqlite` with it touches no consumer. It is a separate package, not a second opener in `acryl-db-postgres`: it ships PGlite
   (25 MB installed, a 10 MB WebAssembly module and 6 MB of data), which a server user should not install. The shared Postgres dialect code (the `?` scanner and the binding
   count check) is `acryl-db-postgres/dialect`, an entry that imports nothing, so `pg` is installed but never loaded.
2. Provides and consumes: provides `db`. It reads the optional `appInstance.home` for its default folder (`<home>/pglite`), as
   `acryl-db-sqlite` does. There is no hard `inject`.
3. Effects: one effect opens the database, and its disposers run in reverse. `db` is withdrawn first. Then PGlite closes after the
   running calls, which writes the folder out, and the lock file goes last.
4. Configuration: `dataDir`, absolute or relative to the app (`memory://` keeps it in memory), and `migrations`. The row id is
   `acryl-db-pglite`, the package name.
5. Events and durability: the data folder is the durable state. One process per folder: PGlite does not lock its folder, and a probe
   showed two processes writing one cluster at once. The provider holds `acryl-db-pglite.lock` (pid and token). A live holder,
   this process included, fails the open; a dead holder's lock is taken over.
6. Verification: a real Loader row on the built `lib/index.js`:
   - PENDING until it provides `db`;
   - five unload and reload cycles, each releasing the lock and keeping the data;
   - the app-home default;
   - a second row on the same folder fails while the first keeps serving.

As built:

- The `db` conformance suite passes unchanged, twice: in memory and on a data folder.
- Data survives closing and reopening: in this process, from a second Node process that wrote and closed, and across three reopens
  with migrations applied once.
- The lock: refused in this process and from a live second process, taken over from an exited one, and released when a migration
  fails (the schema is unchanged).
- Electron's main process: `scripts/electron-main-check.mjs`, run as Electron's main script with ELECTRON_RUN_AS_NODE refused. It
  migrates, writes in a transaction, closes, reopens and reads. Electron's own folders go to a throwaway userData.
  - Passed locally on Electron 44.9.3, Node 24.22.0, darwin arm64.
  - CI runs it with Desktop's Electron in Desktop on Linux (xvfb) and in Windows' Desktop job.
- The Data workflow runs the package's check on its six legs. PGlite's types never reach the package's public declarations (they need
  Emscripten's and WebAssembly's globals), and a test pins that.

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
   - Config, validated by Schemastery: only `tools.expose` (string[], default empty). As built, there is no `approval` or `enabled`
     option. Every act shows the in-page "agent is driving" indicator with its kill switch, so the person at the page can always stop
     it. The operator holding the secret is the user's own agent, as in 041's online channel, and every call is audited with
     approval `token`. Whether the door runs at all is decided by the row: the template mounts it for development only.
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
   - As built (slice 10, 2026-10-27): the door writes both commands each time it starts, after `door.json`, and leaves them when it
     stops (run then, they exit 3, "no running app"). Each runs the client with the app's own Node (`process.execPath`, with
     `ELECTRON_RUN_AS_NODE` when that is Electron, and the type-stripping flag when the client runs from source on a Node that needs
     it) and `--dir <root>`, so PATH plays no part. `.acryl/bin/` is `0700`, `acryl` `0700`. Gate test
     (`plugins/acryl-door/tests/host/shim.spec.ts`): two apps running at once, each folder's command names its own folder in `brief`,
     `look` sees only its own page, and a decoy `acryl` first on PATH is never run.

Coordination: Blends owns the template row, the script tag in the template page, the `.gitignore` line, vendoring `acryl-door`
into the library, and the skill text (verbs sent after this design is accepted).

## Slice 12 - looking at the app (2026-10-27, Fork3)

As built:

- The snapshot lists every run of visible text as a `text` node, in reading order and at the depth of its element:
  `<p>Time left: <span>24:59</span></p>` reads as `text "Time left:"` and `text "24:59"`. A run is the text between two child
  elements, collapsed and clipped to 200 characters.
- Text that is already a name or a value is not listed twice: the content of buttons, links, tabs, options, headings, switches, tree
  items, checkboxes, radios, alerts and statuses; label text; the content of text boxes, search boxes, comboboxes (a native select's
  options) and spin buttons. Hidden text, the driver's own bar and marked sensitive areas are left out, as for elements.
- A text node has a ref. It resolves while its element still shows that run, and is `stale-ref` once the text changed; a click on it
  clicks its element.
- The DSH door gets the same snapshot (`ui_snapshot`), through the shared driver.
- Gate test (`plugins/acryl-door/tests/host/door.spec.ts`, "lets the agent read a value off the page as written"): the operator's
  `look` reads `25:00` from a plain `<span>` with no role, label or test id; after `act click` it reads `24:59`. Unit cases in
  `tests/page/visible-text.spec.ts`.

Ticket - screenshot verb, deferred (coordinator, 2026-10-27). A page cannot capture itself without a prompt, and the door has no
handle on the user's browser. Options were: (a) the page draws itself (SVG `foreignObject` onto a canvas; cross-origin images,
canvas, video and iframes come out blank), (b) Electron's `webContents.capturePage` for the DSH Desktop door only, (c) both. None is
built: the text snapshot covers the gate, an agent that wants pixels can use its own browser tooling, and (a) adds a blank-image
failure mode. Add (c) if the M5 product test shows an agent needing pixels.

## Slice 13 - one verb list (2026-10-27, Fork3)

Mini-design:

1. Boundary: the verbs stay in `acryl-door`; there is no new plugin. MCP and the chat are two more faces of the same `Door.run`.
2. Provides and consumes: one table, `VERBS` and `VERB_SPECS` (`src/host/verbs.ts`: usage line, description, JSON Schema of the
   arguments). The operator client's `verbs` and `brief`, MCP's `tools/list` and the chat tools are all read from it. The door
   consumes the optional `tools` registry (acrylblends' `agent` plugin) through `ctx.inject(['tools'], ...)`; the hard `inject`
   list is unchanged.
3. Effects: one effect in that inject child registers the nine chat tools. Its disposer aborts their running calls and removes
   them. A name that is already taken removes the ones registered before it and fails the child. The MCP route is a door route,
   mounted and removed with the others.
4. Configuration: no new row or key. `tools.expose` refuses a `door_` name, so the door never offers its own verbs as app tools.
5. Events and durability: none.
6. Verification: a real app with the router, the node server and a Blends-shaped registry, and the door started and stopped three
   times. Each stop leaves the registry with only the app's tool.

As built:

- CLI: `.acryl/bin/acryl <verb>`, as before; `acryl verbs` prints the table's names.
- MCP: `POST /api/acryl-door/mcp`, behind the operator's guard (loopback, this run's secret). It is streamable HTTP in its
  request/response form, with no event stream. It answers `initialize`, `ping`, `tools/list` and `tools/call`. Each verb is one tool
  under the verb's own name, taking the arguments the CLI sends. A failed verb is a tool result with `isError` and the text
  `<code>: <message>`, the line the CLI prints.
- Chat: each verb is registered in the `tools` registry as `door_<verb>` (`door_plugin_add`), so it never meets an app tool's name.
  A tool answers the verb's text; a failed verb throws `<code>: <message>`. Slice 14's panel reads them from the registry.
- Gate test: `plugins/acryl-door/tests/host/verbs.spec.ts`, "offers the same verbs in the CLI, over MCP and in the built-in chat".
  It lists the verbs from the folder's command, from MCP's `tools/list` and from the registry, and compares them with each other and
  with the table. It also checks that a command line parses for every verb. Further cases check the same `brief` text and the same
  failure code on all three faces, and the three stop and start cycles.

## Slice 17 - one home for the framework: the acrylblends repository (2026-10-27, Blends; execute after slice 9 lands)

Owner, 2026-10-27: the framework's home is acrylblends for now, `acryl` later. Today the source is here and the acrylblends repository holds a
*copy* (`scripts/sync-framework.mjs`, `framework.json`, `vendor-framework-package.mjs`, `verify-framework-sync.mjs`); every release starts with
a pack, a vendor and a drift check. Slice 17 removes the copy step: the source moves, with its history, and ACRYL depends on what is published.
Decided with the coordinator (2026-10-27): **only two packages are published, `acrylblends` and `create-acrylblends`**; no new package names exist, and ACRYL's IDE consumes the framework
through `acrylblends` subpaths, the same way an app does.

### Which packages move

| Source (today's name) | From (ACRYL) | To (acrylblends) | Note |
| --- | --- | --- | --- |
| `acryl-router`, `acryl-router-http` | `plugins/` | `plugins/` | the router, the Cordis plugin that serves it |
| `acryl-node-server` | `plugins/` | `plugins/` | includes client modules and `read-sse` |
| `acryl-state` | `plugins/` | `plugins/` | |
| `acryl-db`, `acryl-db-sqlite` | `plugins/` | `plugins/` | `acryl-db-postgres` does NOT move: it stays an optional plugin in ACRYL |
| `acryl-kv`, `acryl-kv-json`, `acryl-kv-db` | `plugins/` | `plugins/` | |
| the door (`acryl-door`, slice 9) and `acryl-loopback-http` | `plugins/` (and where it is today) | `plugins/` | the door uses `acryl-loopback-http`, so it moves with it |
| the framework package build | `distribution/acrylblends-framework` | `packages/framework` | what builds the `lib` of the `acrylblends` package |
| the framework docs | `docs/framework` | `docs/framework` | the source of the pages every new app carries |

`acryl-control` does **not** move: the door imports only Cordis, schemastery, `acryl-router` and `acryl-node-server` (confirmed by Fork3), so the framework never depends on it.

`plugins/` in acrylblends is already the library `acrylblends add` copies from. After the move the `acryl-*` folders there are the **source**, not a vendored copy
(their `upstream.json`, `UPSTREAM.md`, `framework.json` and the `testsNotRun` list go away). Specs, the IDE (`apps/`), the Host, DSH, `acryl-control` and everything that is not the
framework stay in ACRYL. The folder names stay `acryl-*` inside the repository; they are not npm names, because they are not published on their own.

### What `acrylblends` gains: the Cordis forms as subpaths

The `acrylblends` package today carries the framework without Cordis (`acrylblends`, `acrylblends/cors`, ..., `acrylblends/db`, `acrylblends/kv`) and the library as source. ACRYL's IDE
needs the Cordis plugin forms too (the router and node-server plugins, state, the `db` and `kv` providers, the door). They become subpaths of the same package, built by the
same tsdown run, with `@deepseek-ai/cordis` an optional peer dependency (a plain app that never imports them never needs Cordis):

| Subpath | Is |
| --- | --- |
| `acrylblends/cordis/router`, `acrylblends/cordis/router-http` | the router and its HTTP plugin |
| `acrylblends/cordis/node-server` | the Node server plugin |
| `acrylblends/cordis/state` | the state cells |
| `acrylblends/cordis/db`, `.../db-sqlite`, `.../kv`, `.../kv-json`, `.../kv-db` | the ports' Cordis forms and their providers |
| `acrylblends/cordis/door` | the door |

The existing plain subpaths do not change. `scripts/exports.mjs` and `verify-standalone.mjs` (today in `distribution/acrylblends-framework`) check the new entries the way they check the old ones:
a packed tarball installed in a scratch project must resolve every subpath, and importing a plain subpath must not load Cordis.

### How the history moves

1. Freeze: the coordinator stops landing changes under the moving paths in ACRYL, after slice 9 is on main (a day, announced in the thread). The freeze hash is H.
2. `git-filter-repo` is one Python file: download it into a scratch folder (or `pip install git-filter-repo` into a scratch virtualenv); nothing is installed on the machine.
3. In a scratch clone of ACRYL at H: `git filter-repo` with one `--path` per moved folder (and `--path-rename` where the destination differs, e.g.
   `distribution/acrylblends-framework/` to `packages/framework/`). Every commit that touched a moved path stays, with its author and date; others disappear.
4. In acrylblends, on a branch: remove the vendored copies of those folders in one commit, then `git remote add acryl-history <scratch clone>`,
   `git fetch acryl-history` and `git merge --allow-unrelated-histories acryl-history/main`. The merge commit says "moved with history from acryldev/acryl at H".
   Because the vendored copies were removed first, the merge has no add/add conflicts. The tree after the merge equals H for the moved paths (checked by a diff against H).
5. Delete the copy machinery (`scripts/sync-framework.mjs`, `vendor-framework-package.mjs`, `verify-framework-sync.mjs`, `framework.json`, the `PLUGINS` table) and its
   tests, in a second commit, so the move itself is a pure history operation.

### How ACRYL consumes it

- ACRYL's `workspace:*` dependencies on the moved packages become one dependency, `acrylblends@^<release>`, and imports change from a package name to a subpath
  (`import { Acryl } from 'acryl-router'` to `import { Acryl } from 'acrylblends'`; the Cordis plugin to `acrylblends/cordis/router`). pnpm resolves it from the registry; there is no
  checkout of acrylblends beside ACRYL in CI.
- To work on both at once, a developer uses a pnpm override that links `acrylblends` to a local checkout (`link:../acrylblends/packages/framework`) in an uncommitted file (documented in
  ACRYL's CONTRIBUTING); nothing committed points at a path outside the repository.
- Every push to acrylblends `main` publishes `acrylblends@<next>-next.<run>` on the `next` dist-tag, so ACRYL can test unreleased framework work from the registry without a copy.
- ACRYL tests and scripts that reach into the moved folders by path are rewritten to import the subpath. The count is taken at execution with `grep` over the freeze commit; the gate
  below proves none is left.

### Publishing

One workflow in acrylblends builds, packs, installs from the tarballs in a scratch project, and publishes `acrylblends` and `create-acrylblends` (versions as today, `create-acrylblends` keeping its own
number). Publishing uses the existing token flow; trusted publishing stays as the written plan (`specs/019-trusted-publishing`), unchanged by this slice.

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
installs the published `next` build and runs the IDE's own gates (`apps/acryl-desktop`, `apps/acryl-cli`).

### Order and gate

1. Slice 9 lands (the door exists in ACRYL). 2. Freeze and move (above). 3. acrylblends CI green on the three systems. 4. Release the first `acrylblends` that carries the Cordis subpaths from acrylblends alone.
5. In ACRYL, one branch: delete the moved folders, switch the dependents to `acrylblends`, fix path imports, run ACRYL's four workflows. 6. Land; lift the freeze.
**Gate:** a release is built and published from the acrylblends repository only, and ACRYL's workflows pass on the published package.

### Rollback, step by step

Nothing in ACRYL changes until step 5, so each earlier step is undone without touching ACRYL.

| Failure at | What is true | Roll back by |
| --- | --- | --- |
| 1 (freeze) | nothing moved | the coordinator lifts the freeze |
| 2 (filter or merge looks wrong) | the work is on a branch of acrylblends and in a scratch clone | delete the branch and the scratch clone; `main` of both repositories is untouched |
| 3 (CI red on a system) | same branch | fix on the branch, or delete it; ACRYL still builds from its own folders |
| 4 (release fails after a partial publish) | `acrylblends@<x>` may exist on npm | npm versions cannot be reused: publish the next patch from the same branch after the fix; ACRYL still does not depend on it |
| 5 (ACRYL gates red on the published package) | ACRYL's branch is unmerged | do not merge; fix in acrylblends and publish a patch, or abandon the branch |
| 6 (a problem found after landing) | ACRYL main points at `acrylblends@<x>` | revert the one ACRYL commit (it restores the folders and the `workspace:*` dependencies); acrylblends keeps its copy of the source, and the sync scripts return from git history if the copy step is needed again |

The freeze lifts only after step 6 is verified (ACRYL's workflows green on main), never before.

### Open questions

1. The names of the Cordis subpaths above are a proposal (`acrylblends/cordis/...`); the owner or the coordinator may prefer another prefix. Nothing else depends on them until execution.
2. Who announces the freeze: the coordinator (decided). Slice 9 must have landed, and no framework slice may be in flight on the moved paths.

## Slice 14 - the built-in agent: a chat panel in the app (2026-10-27, Blends; mini-design, execute after 0.8.0)

Spec line: "an app can show its own chat panel whose agent uses the same door (DSH chat or a PTY driver: claude, codex, pi), opt-in per app. Gate: from the panel, the agent adds a feature and the page shows it without a restart."

### What exists to build on

- The door (slices 9 to 13): `look`, `act`, `plugin add|remove|reload|list`, `tool list|call`; with the `agent` plugin's `tools` registry up, the door registers `door_brief`, `door_look`, `door_act`, `door_plugin_*` and `door_tool_*` in it (slice 13), so the built-in agent needs nothing door-specific.
- The `agent` template (`acrylblends init --template agent`): `agent`, `tools`, `model` (an offline scripted model, or any OpenAI-compatible API from `OPENAI_*` / `DEEPSEEK_API_KEY`), `builder` (writes a plugin into `plugins/`), `extensions` (installs it live, rolls back a broken one), `sandbox`, `tasks`, `POST /ask`, and the state cells `GET /api/state/tasks/events` and `GET /api/state/extensions/events`.
- `readSSE` (0.7.8) for a streamed answer in the browser, and `clientModules` for browser code with no bundler.

### The panel

One library plugin, `agent-panel` (authored in this repository's `plugins/`, copied by `acrylblends add agent-panel`; not vendored from ACRYL). It requires the `agent` family (`agent`, `tools`, `model`, `builder`, `extensions`, `sandbox`, `tasks`), so adding it to an app without them adds them. Opt-in is the act of adding it; `blend.yaml` gets one row and `disabled: true` switches it off.

- **Where it appears.** A router middleware appends one script tag, `/api/agent-panel/panel.js`, to every HTML response of the app (before `</body>`), so no template page is edited. The script draws a small button at a screen corner that opens a side panel (a shadow root, so the app's CSS cannot touch it and it cannot touch the app's): the conversation, a text box, Send and Stop.
- **How it asks.** `POST /api/agent-panel/ask` with `{ message, driver }`, answered as server-sent events: `text` (a piece of the answer), `tool` (a tool call and its result, one line), `change` (a plugin was installed, updated or removed), `done`, `error`. The browser reads it with `readSSE`; Stop aborts the request and the route stops the run (`c.req.raw.signal`).
- **Drivers.** `driver: 'agent'` (default) runs the app's own `agent` service with its tools, including the `door_*` ones; this is the "DSH chat" form and needs no program on the machine. `driver: 'claude' | 'codex' | 'pi'` starts that program headless in the app folder with the message as its prompt (the same command lines the product test uses), and relays its output as `text` events; those programs use `.acryl/bin/acryl` as `AGENTS.md` tells them. A driver whose program is not installed is not offered by the panel. Keys come only from the environment the app was started in; none is stored.
- **The page shows it without a restart.** When a `change` arrives (the extensions cell reports an install or a removal), the panel reloads the page it sits on after the run is `done`, and says so in the conversation. A new route or page is then served by the plugin that was just installed live; nothing restarts.
- **Safety.** Same switches as the door: off with `NODE_ENV=production` or `ACRYL_DOOR=off`. The route accepts only a loopback connection carrying the app's own origin (as the door's channel does) and a per-run token the page script is given, so another site or another local program cannot drive the agent. One run at a time per app; a second `ask` while one runs is refused with a message. Every ask and every tool call is written to `.acryl/audit/agent-panel.jsonl` without the secrets.

### Gate and tests

1. Plugin unit tests: the SSE event sequence for a scripted model; a broken plugin install ends in `error` with the previous version kept; the middleware adds the tag only to HTML; the route refuses a foreign origin and a second concurrent run.
2. The scaffolder: an `agent` app with the panel added, an offline scripted model, headless Chrome on the app's page: the panel opens, the message "create route hello /hello Hello" is sent, `change` arrives, the page reloads, and `/hello` answers `Hello` with the process id unchanged (no restart). Read through `.acryl/bin/acryl look` as well.
3. The product test: the same scenario with a real model (DeepSeek key from the environment) adding a visible element to the page, and once per driver program that is installed.

### Open questions

1. Reload the page automatically after a `change`, or show a "reload" button? Recommendation: reload after `done` unless the text box holds unsent text.
2. Should `acrylblends init --template agent` include the panel by default? Recommendation: no; it is the opt-in `acrylblends add agent-panel`, so an app that never asks for an agent never serves its script.
