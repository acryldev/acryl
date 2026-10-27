# Spec 049 - The ACRYL Framework Architecture

Status (2026-10-27): slices 1, 3, 4, 7 and 8 are done and released; slice 2 (Postgres) is built but is not a default. The owner decided on
2026-10-27: no `durable` layer, JSON and SQLite are the only defaults, and the next work is agents building apps from inside (Part 2).
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
| Data | Where does my app keep its records? | `db` | `acryl-db-sqlite` (one file in the app home) | exists |
| | My app is tiny; can it skip SQL? | `kv` | `acryl-kv-json` (one JSON file, atomic replace); `acryl-kv-db` over `db` | exists |
| | SQLite is not enough, still no server | `db` | `acryl-db-pglite`: embedded Postgres (PGlite, WASM), one folder in the app home; optional plugin | new, optional |
| | A hosted or custom backend (hosted Postgres, Supabase, a team server for a distributed desktop app) | `db` | `acryl-db-postgres` (a connection URL), or the app's own provider that passes the `db` conformance suite | exists, optional |
| | How does the UI see changes live? | `state` (observable cells over SSE) | `acryl-state` | exists, in memory |
| UI, simple | Pages without a build step | JSX on the server, client modules for islands | `acrylblends/jsx`, `clientModules()` | exists |
| UI, rich | A full client application | React with ACRYL's component library | `acryl-ui` | exists in the IDE, not yet in templates |
| Desktop | The same app as a desktop window | `desktop` | the desktop plugin (Electron) | exists for Blend apps |
| Agents | Who builds and runs the app from inside? | `drivers` (one per agent) and the door (`acryl control`) | PTY driver (claude, codex, pi, ...), DSH chat driver | door exists; not yet in new apps (Part 2) |
| Tooling | How do I start and grow an app? | `acryl new`, `acryl add` | today `npm create acrylblends`, `acrylblends add` | exists under the interim name |

### The dependency rule

Dependencies point inward, and the rule is checked by a test, not by this text:

```
Surfaces and drivers  (web, desktop, TUI, PTY drivers, DSH chat)
        |  call
Adapters              (acryl-node-server, acryl-db-sqlite, acryl-db-postgres, acryl-kv-json, desktop)
        |  implement
Ports                 (the service interfaces: router, db, kv, state, drivers)
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
- One way per job. There is one data API per need (`db`, `kv`), one way to serve, one way to add a plugin. A second way is
  added only when the first cannot do the job, and the spec says why.

### Defaults with choices, never rigid (owner, 2026-10-27)

"In JS world it's important to stay not rigid as Rails, but swappable options from the fast changing JS ecosystem of thousands of
tools, so ACRYL can adapt to the use case: have some fallbacks, but offer choice made during development as it's needed, or made
completely by an agent. Use all benefits of Cordis as an agentic-first framework."

- **Every choice is a plugin behind a port.** The framework ships a working default for each port (SQLite, JSX, the node server) and
  any outside tool (a renderer such as Vike, an ORM, an auth library, a hosted database) can be wrapped as another provider of the
  same service. The app's code does not change; one Loader row does.
- **Cordis is what makes this safe while the app runs.** Services are found by name (`inject`), so a consumer never knows the
  provider; replacing a provider unloads and reactivates its consumers (PENDING is a valid state, not an error); every resource is
  owned by an `effect` and released on unload. A swap is therefore a live operation, not a rebuild.
- **An agent can make the choice.** Adding, removing and reloading plugins are door verbs (`acryl control plugin ...`, slice 13), so the
  agent inside the app picks and swaps providers the same way a person does, and the result is visible at once.
- **The suite is the contract.** A provider is accepted by passing its port's conformance suite, whoever wrote it. That is what lets
  thousands of outside tools in without the framework becoming a mess.
- **Not Rails:** no tool is required beyond Cordis and the ports. A default is a fallback, not a lock.

## Data

Two needs, two small ports. Most apps use one of them. The owner, 2026-10-27: no framework is bound to a big stack; JSON and SQLite
are the defaults, and an app that needs Postgres or Supabase connects it as a data source when it needs one.

### `db` - relational records (the default)

For any app with users, lists, orders: SQL, because people and agents already know it.

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
- Provider: `acryl-db-sqlite` (`node:sqlite`, WAL, one file at `<app home>/data.sqlite`). `acryl-db-postgres` exists as an optional
  plugin (`DATABASE_URL`; Supabase is Postgres with a connection string), tested on PGlite in CI, and is not shipped in `acrylblends`.
- Dialect differences an app must know (placeholders, `RETURNING`, types) are listed once in the `db` guide and checked by the
  conformance suite, which runs the same migrations and queries on both providers.

### `kv` - a tiny app's data

For a demo, a settings page, a one-person tool: named JSON documents, no SQL.

```ts
interface Kv {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  update<T>(key: string, change: (current: T | undefined) => T): Promise<T>  // atomic; change is synchronous
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}
```

- `acryl-kv-json` keeps everything in one JSON file and writes it atomically (write to a temporary file, then rename), so a crash
  leaves the old or the new file, never half of one.
- `acryl-kv-db` provides `kv` over whichever `db` provider is active (one `kv` table, created on first use), so a tiny app that grows into
  SQL keeps its data: move from `acryl-kv-json` to `acryl-kv-db` with one import command (`copyKv`). It is a plugin of its own, not a second
  service of each `db` provider (decided in slice 3): replacing the file by SQL is then a different row, and a `db` provider stays one service.
- `update`'s callback is synchronous (an `async` function is a type error and a returned promise is rejected), `list` sorts by code point, and
  a JSON file belongs to one process; past a few MB or with more than one process, use `acryl-kv-db`.

### No `durable` layer (decided 2026-10-27)

An earlier draft ported pi's `durable` package as a third data port. Dropped by the owner: outside agents (Claude Code, Codex, pi)
keep and resume their own sessions, so ACRYL cannot checkpoint them, and an app that runs its own agent loop needs only a few
tables in its own SQLite (conversation entries, tasks with a status, a done mark per step). That is app code on `db`, written when
a real app needs it, not a framework layer.

### Choosing

| The app | Use |
| --- | --- |
| Tiny, one person, a few screens | `kv` with `acryl-kv-json` |
| Normal web or desktop app | `db` with `acryl-db-sqlite` (the template default) |
| SQLite is not enough, but no server | `db` with the optional `acryl-db-pglite` (embedded Postgres) |
| Hosted Postgres, Supabase, or a custom backend | `db` with the optional `acryl-db-postgres`, or the app's own provider |

The ladder (owner, 2026-10-27): JSON, then SQLite, then PGlite, then a hosted or custom backend. Each step is one provider row; app code
that uses `db` does not change between SQLite, PGlite and a hosted Postgres. Login and users (for example Supabase Auth) are not part of
`db`; an app that needs them adds an auth plugin of its own, and the framework adds one only when a real app needs it.

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

Each slice lands on `main` only when its gate passes. Owners in brackets.

### Part 1 - the framework and its data (done)

1. **`db` port and SQLite provider** [Fork3] - done, acrylblends 0.7.5.
2. **Postgres provider** [Fork3] - built and on main as an optional plugin; not in `acrylblends`, not in templates (owner, 2026-10-27).
2b. **Embedded Postgres** [Fork3, after slice 9] - `acryl-db-pglite`: PGlite with its data folder in the app home, sharing the
   Postgres dialect code with `acryl-db-postgres` (one package with two openers if that is simpler). Gate: the `db` conformance suite
   passes unchanged; data survives closing and reopening the folder; it runs in Electron's main process.
3. **`kv` and the JSON provider** [Blends] - done, acrylblends 0.7.7 (group commit on Windows: main c6e766da).
4. **Templates on `db`** [Blends] - done, acrylblends 0.7.5.
5. ~~`durable` port~~ - dropped (owner, 2026-10-27).
6. ~~Tasks and state on `durable`~~ - dropped; persisted `acryl-state` cells and the tasks plugin use `db` or `kv` when an app needs them.
7. **The dependency-rule check** [Fork3] - done, `acrylblends check-deps`, 0.7.6.
8. **`acryl new` with registry and git sources** [Blends] - done, `create-acrylblends <name> <source>`.

### Part 2 - agents build the app from inside

The owner, 2026-10-27: "we need real usable framework for apps with built-in agents building inside-out". The 2026-10-22 experiment
(`docs/acryl/ARCHITECTURE.md` section 7) showed what decides it: the door must be open, and the app folder must carry its own
self-knowledge. With both, Claude Code, Codex and pi each built, installed, clicked-to-verify and kept a plugin. Every app made by
`create-acrylblends` must have both, with no hand-written files.

9. **The door in every new app, safely** [Fork3] - `acryl-agent-control` is a plugin of the app; its secret, worker files and audit
   live under `<app>/.acryl/`, which the template's `.gitignore` lists. Gate: a fresh app answers `acryl control tool list`, and
   `git add -A` in it stages no secret.
10. **The door is found from the app folder** [Fork3] - `<app>/.acryl/bin/acryl control ...` reaches only the app running from that
    folder, never a user's own `acryl` on `PATH`. Gate: two apps running at once, each folder's command reaches its own.
11. **Self-knowledge in the folder** [Blends] - `create-acrylblends` writes `AGENTS.md` and `CLAUDE.md` (the same text) and one skill
    pointing to `docs/framework/` and the door commands; one plugin folder (`plugins/`) everywhere in the docs. Gate: the docs name no
    second plugin folder.
12. **Looking at the app** [Fork3] - the door's snapshot carries the visible text and roles; a screenshot verb. Gate: an agent reads
    a value on the page without changing its markup.
13. **One verb list** [Fork3] - the same verbs (`brief`, `look`, `act`, `plugin add|remove|reload`) in the CLI, over MCP and in the
    built-in chat. Gate: one test lists the verbs from each and compares them.
14. **The built-in agent** [Blends] - an app can show its own chat panel whose agent uses the same door (DSH chat or a PTY driver:
    claude, codex, pi), opt-in per app. Gate: from the panel, the agent adds a feature and the page shows it without a restart.
15. **Bring your own tool** [Blends, after 11] - one guide and one worked example: wrap an outside npm tool as a provider of a port,
    pass the suite, swap it in through the door. Gate: an agent follows the guide alone and swaps the provider in a running app.

### Part 3 - one kind of app, one home (owner, 2026-10-27)

The owner: "we are cordis agentic framework for apps web/desktop"; the framework's home is acrylblends for now, `acryl` later.

16. **Every new app is a Cordis app** [Blends] - `create-acrylblends` makes only Cordis apps (`blend.yaml`, plugins in `plugins/`);
    the `nodejs`, `notes` and `chat` templates become Cordis apps with the same features. Gate: each template's tests pass, the door
    (slice 9) mounts in each, `check-deps` is clean.
17. **One home for the framework** [Blends, after slice 9 lands] - the framework's packages (router, node server, state, db, kv, door,
    client modules) live in the acrylblends repository and are published from there; ACRYL's IDE consumes the published packages,
    so the framework never depends on the IDE and there is no copy step before a release. Git history moves with the files. Gate: a
    release is built and published from one repository; ACRYL's gates pass on the published packages.

**Part 2 gate (the product test):** in a fresh `create-acrylblends` app, Claude Code, Codex and pi each, headless and started in the
app folder, build the same feature from the docs alone, check it by clicking through the door, and the feature survives a restart
and a fresh clone; `git status` shows no secret.

Spec 048 (the IDE on the framework) continues in parallel.

## Open questions for the owner

1. **The `acryl` name.** When the framework takes the `acryl` npm name, does the current CLI agent become `acryl agent` (one package,
   Bun-style) or move to another name? Recommendation: one package, `acryl agent` as a subcommand, decided when slice 8 lands.
2. **The door on by default?** Recommendation: on in development (`npm run dev`), off in a production build unless the app turns it
   on. Asked on 2026-10-22, still open.
