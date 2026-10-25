# Spec 049 - The ACRYL Framework Architecture

Status (2026-10-25): design, written by the coordinator for the owner. Nothing here is built yet except where a row says "exists".
Implementation slices are at the end, each with a gate. Specs 047 (the router port) and 048 (the IDE on the framework) continue
unchanged and fit into this map.

## Why

The owner asked (2026-10-25) for the whole framework to be laid out so that it is simple to understand for people and simple and stable
to work with for agents, using pi (`earendil-works/pi`) as the model of a simple architecture and *Clean Architecture* and *The Pragmatic
Programmer* as the engineering rules. In the owner's words: "core - server/routing (honoPORT) - Data acryl-state apps/agents durable
state", "state management with sqlite/Postgres-Supabase (if web-app saas) or fallback to minimal local JSON if it's a tiny lightweight
app", "maybe let's get inspired by pi-DURABLE", and eventually "simple DX like `npx acryl new MY-APP-123`" and
"`npx acryl new @registry/<BOILERPLATE-NAME-OR-GIT-SOURCE>`". "Our IDE is just a custom maxed out case of ACRYL framework."

What was missing: the router, the server, JSX and the client modules exist; durable data does not. Apps today open `node:sqlite` by
hand (the notes template), `acryl-state` is in memory only, and the `tasks` plugin has its own store. There is no single answer to
"where does my app keep its data".

## The map

An ACRYL app is a folder of Cordis plugins. Every capability is one plugin that provides one service; the app's own plugins depend on
those services by name (`inject`), never on which plugin provides them. Swapping SQLite for Postgres, Web for Desktop or Claude for Codex
is a configuration change, not a code change.

| Layer | What a person asks | The service | Provided by (default first) | State |
| --- | --- | --- | --- | --- |
| Core | How do plugins start, stop and find each other? | Cordis `Context`, `inject`, `effect`, Loader | `cordis` | exists |
| Server and routing | How does a request become a response? | `router` (an `Acryl` app per plugin) | `acryl-router` (the port of the upstream router, spec 047) | exists |
| | How is it served? | `routerHttp` | `acryl-node-server`; Desktop's loopback Host; in process for tests and the TUI | exists |
| Data | Where does my app keep its records? | `db` | `acryl-db-sqlite` (one file in the app home); `acryl-db-postgres` (Postgres or Supabase via `DATABASE_URL`) | new |
| | My app is tiny; can it skip SQL? | `kv` | `acryl-kv-json` (one JSON file, atomic replace); also served by either `db` provider | new |
| | Where do agents keep conversations, tasks and checkpoints? | `durable` | `acryl-durable` on the same database file as `db` | new |
| | How does the UI see changes live? | `state` (observable cells over SSE) | `acryl-state` | exists, in memory |
| UI, simple | Pages without a build step | JSX on the server, client modules for islands | `acrylblends/jsx`, `clientModules()` | exists |
| UI, rich | A full client application | React with ACRYL's component library | `acryl-ui` | exists in the IDE, not yet in templates |
| Desktop | The same app as a desktop window | `desktop` | the desktop plugin (Electron) | exists for Blend apps |
| Agents | Who builds and runs the app from inside? | `drivers` (one per agent) and the door (`acryl control`) | PTY driver (claude, codex, pi, ...), DSH chat driver | door exists, drivers in spec 048 Phase 9 |
| Tooling | How do I start and grow an app? | `acryl new`, `acryl add` | today `npm create acrylblends`, `acrylblends add` | exists under the interim name |

### The dependency rule

Dependencies point inward, and the rule is checked by a test, not by this text:

```
Surfaces and drivers  (web, desktop, TUI, PTY drivers, DSH chat)
        |  call
Adapters              (acryl-node-server, acryl-db-sqlite, acryl-db-postgres, acryl-kv-json, desktop)
        |  implement
Ports                 (the service interfaces: router, db, kv, durable, state, drivers)
        ^  depend on
The app's own plugins (its use cases: "create a note", "share a list")
        |  run on
Core                  (Cordis)
```

- An app plugin imports a port's *types* and receives the service through `inject`. It never imports `node:sqlite`, `pg`, Electron or a
  driver. (*Clean Architecture*: inner layers own the interfaces they need; outer layers implement them.)
- Handlers stay humble: a route reads the request, calls one use case, and writes the response. Validation and business rules live in
  the use case, so the TUI, the door and tests call the same code without HTTP.
- Each port has one conformance suite that every provider must pass. A new provider is accepted by passing it, not by review alone.
  (*Pragmatic Programmer*: one authoritative representation, automated checks, short feedback loops.)
- One way per job. There is one data API per need (`db`, `kv`, `durable`), one way to serve, one way to add a plugin. A second way is
  added only when the first cannot do the job, and the spec says why.

## Data

Three needs, three small ports. Most apps use one of them.

### `db` - relational records (the default)

For any app with users, lists, orders: SQL, because people and agents already know it and it moves between SQLite and Postgres.

```ts
interface Db {
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>
  get<Row>(sql: string, ...params: SqlValue[]): Promise<Row | undefined>
  all<Row>(sql: string, ...params: SqlValue[]): Promise<Row[]>
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>
}
```

- Shape: the `SqliteDatabase` facade from pi's `chord` package (exec/run/get/all/transaction), ported with its tests and its MIT notice
  in LICENSE. It is the smallest interface both SQLite and Postgres can honour.
- Postgres is asynchronous. The port is therefore promise-returning (`await db.all(...)`), and the SQLite provider resolves
  immediately. One signature for both, so code does not change when the provider does.
- Migrations: numbered files in the app's `migrations/` folder (`001-notes.sql`, `002-tags.sql`), applied in order at start inside a
  transaction, recorded in a `_migrations` table. No ORM and no query builder in the framework; an app may add one as its own plugin.
- Providers: `acryl-db-sqlite` (`node:sqlite`, WAL, one file at `<app home>/data.sqlite`) and `acryl-db-postgres` (`DATABASE_URL`;
  Supabase is Postgres with a connection string). Postgres runs in CI without a server through PGlite.
- Dialect differences an app must know (placeholders, `RETURNING`, types) are listed once in the `db` guide and checked by the
  conformance suite, which runs the same migrations and queries on both providers.

### `kv` - a tiny app's data

For a demo, a settings page, a one-person tool: named JSON documents, no SQL.

```ts
interface Kv {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  update<T>(key: string, change: (current: T | undefined) => T): Promise<T>  // atomic
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}
```

- `acryl-kv-json` keeps everything in one JSON file and writes it atomically (write to a temporary file, then rename), so a crash
  leaves the old or the new file, never half of one.
- Both `db` providers also provide `kv` (one table), so a tiny app that grows into SQL keeps its data: move from `acryl-kv-json` to
  `acryl-db-sqlite` with one import command.

### `durable` - agents' and apps' long-running state

For agent conversations, tasks that survive a restart, and documents edited over time. This is where pi's `durable` package is the
model, and its storage layer is ported, not reinvented:

- **What is ported** from `packages/durable` (pinned commit, provenance file as in spec 047): the storage contract (one atomic commit
  per batch; memory adopts a batch only after it is stored, so nothing is shown before it is durable), the memory, JSONL and SQLite
  storages, and the storage conformance suite (about 1,800 lines of tests). With what they need from `chord` (`delta`, the SQLite
  facade). About 6,500 lines with tests.
- **What is not ported**: pi's agent harness, model calls, code mode, telemetry and tools. ACRYL's agents are drivers; pi itself is one
  of them.
- **The model an app sees**: conversations are transcripts of immutable entries; tasks are durable state machines with checkpoints that
  resume after a crash; documents have a kind, a version and either latest-only or rewindable history; every submission carries a
  request id, so a retry after a crash does not run twice.
- **Where it lives**: in the same database as `db` (its own table prefix), so an app has one data file, one backup and one migration
  story. A Postgres storage is ACRYL's own work, accepted only by passing the ported conformance suite.
- The `tasks` plugin moves onto `durable` and its own JSONL/SQLite store is retired. `acryl-state` cells can be bound to a `durable`
  document or a `kv` key, so a live view survives a restart.

### Choosing

| The app | Use |
| --- | --- |
| Tiny, one person, a few screens | `kv` with `acryl-kv-json` |
| Normal web or desktop app | `db` with `acryl-db-sqlite` (the template default) |
| Hosted, many users (SaaS) | `db` with `acryl-db-postgres` (Supabase or any Postgres) |
| Anything with agents or long tasks | add `durable` (same file or database) |

## Naming

Today: the framework ships as `acrylblends` (`import { Acryl } from 'acrylblends'`) and `create-acrylblends`; the npm package `acryl`
is the CLI agent. Where we are going: one name, `acryl`.

```sh
npx acryl new my-app                                 # the default template
npx acryl new my-app --template notes                # a built-in template
npx acryl new my-app @acryl/chat                     # a template from the registry
npx acryl new my-app github:someone/their-starter    # any git source
```

- Every place that spells the package or command name reads it from one table (`scripts/lib/names.mjs` in acrylblends; the docs build
  substitutes it), so the rename is a one-line change plus a release, not a search and replace.
- A git template is a plain repository with an `acryl.template.json` (name, description, the plugins it needs). A registry template is
  the same, published to npm under a scope. `acryl new` never runs a template's scripts without asking.
- The rename itself waits for the owner's decision on what happens to the current `acryl` CLI (see Open questions).

## Slices

Each slice lands on `main` only when its gate passes. Order matters; owners in brackets.

1. **`db` port and SQLite provider** [Fork3, after the Electron slice] - port the chord SQLite facade with provenance; `acryl-db-sqlite`;
   migrations; the conformance suite. Gate: the suite passes on Node 22 and 24, on macOS, Linux and Windows.
2. **Postgres provider** [Fork3] - `acryl-db-postgres`; the same suite on PGlite in CI and once against a real Postgres. Gate: the
   suite passes unchanged; the dialect list in the guide matches what the suite checks.
3. **`kv` and the JSON provider** [Fork3] - `acryl-kv-json`, `kv` on both `db` providers, the import command. Gate: a crash test (kill
   during write) never leaves an unreadable file.
4. **Templates on `db`** [Blends] - the notes template and the chat template use `db` and migrations instead of opening `node:sqlite`;
   docs: the data guide and the choosing table. Gate: claude and codex each build the "add tags" task on the new template from the docs
   alone, tests pass.
5. **`durable` port** [Fork3] - pi's storage layer and conformance suite with provenance and the MIT notice in LICENSE; the ACRYL
   Postgres storage. Gate: the ported suite passes on memory, JSONL, SQLite and Postgres.
6. **Tasks and state on `durable`** [Blends] - the `tasks` plugin on `durable`; persisted `acryl-state` cells. Gate: a task resumes
   after the app is killed mid-task; a cell keeps its value across a restart.
7. **The dependency-rule check** [Fork3] - a test that fails when an app plugin imports a provider (`node:sqlite`, `pg`, `electron`,
   a driver) instead of a port. Gate: it fails on a planted violation and passes on the templates.
8. **`acryl new` with registry and git sources** [Blends] - under the interim name first (`create-acrylblends <name> <source>`).
   Gate: `github:` and a scoped npm template both create a working app in a scratch HOME.

Spec 048 (the IDE, slice by slice) and the hosting adapters and Bun (spec 047 Part B) continue in parallel; the IDE adopts `db` and
`durable` as its slices reach data.

## Open questions for the owner

1. **The `acryl` name.** When the framework takes the `acryl` npm name, does the current CLI agent become `acryl agent` (one package,
   Bun-style) or move to another name? Recommendation: one package, `acryl agent` as a subcommand, decided when slice 8 lands.
2. **Agreed by default unless the owner says otherwise:** SQLite is the template default; `kv` is the tiny-app path; `durable` is
   ported from pi's storage layer (MIT, notice in LICENSE only, as with the router).
