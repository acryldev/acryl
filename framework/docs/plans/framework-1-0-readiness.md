# Framework 1.0 readiness

Status: audit with the decisions taken (section 6); this is milestone M10, `acrylblends` 1.0, target 2026-10-30 12:00 CET. Written 2026-10-28 against `acrylblends` 0.11.0 and `create-acrylblends` 0.4.1. No code. It lists what a paying user would hit that is unfinished or rough, and marks each item **must (1.0)** or **later**. Everything here was read off the repository, the published packages or a run, not guessed; where a claim rests on a search or a count, the method is said.

## What 1.0 would promise

Semantic versioning on the public subpaths of `acrylblends` and on `create-acrylblends`, a documented path from every 0.x app, templates that work from the registry with only their own docs, and a clear line around what is a development tool and what is production. Nothing below needs a redesign; most items are decisions, documentation and one missing command.

## 1. The API surface to freeze (125 subpaths, 126 with `./package.json`)

The package exports 125 subpaths. By a text search of the docs for `acrylblends/<subpath>` (release notes and plans excluded), 73 are mentioned and 51 are not.

| Group | Count | Proposal | Verdict |
| --- | --- | --- | --- |
| Core: `.`, `request`, `types`, `http-exception`, `tiny`, `quick` | 6 | Public, frozen. `Acryl` is the name; `App` and `AppRequest` are kept as deprecated aliases (the package test checks `App === Acryl`): remove them in 1.0 or keep them with a stated end date. | must (decide the aliases) |
| `acryl-base` | 1 | Internal chunk (`one Acryl class`). Not documented, not for imports. Remove it from `exports`. | must |
| Middleware (`cors`, `jwt`, `csrf`, `timeout`, ..., `loopback-only`) | 28 | Public, frozen. 26 of the 28 subpaths are named in the docs; `serve-static` is documented through the `serveStatic` import from `acrylblends/node-server` and `acrylblends/bun`, and `loopback-only` has a page that imports it from the copy name `acryl-router/middleware`. | must (the two import lines) |
| Helpers and validators (`cookie`, `streaming`, `testing`, `validator`, `schema-validator`, `html`, `route`, `factory`, `proxy`, `ssg`, `dev`, `accepts`, `adapter`, `conninfo`, `css`, `ws`, `client`, `read-sse`) | 18 | Public, frozen. `ws` and `css` have no page that names the subpath. | must (docs) |
| JSX (`jsx`, `jsx/streaming`, `jsx/dom`, `jsx/dom/client`, `jsx/dom/css`, `jsx/dom/server` and the four `*-runtime` entries) | 10 | The first six public; the `*-runtime` entries are compiler targets named in `tsconfig` only. Say so in one table. | later |
| Routers (`router` and five implementations) | 6 | Public. The five implementations are a tuning choice for advanced users. | later |
| `utils/*` | 22 | **Internal.** None is documented. They are the ported core's helpers. Remove from `exports` (or mark unsupported): a frozen 1.0 should not promise `utils/ipaddr` or `utils/color`. | must |
| Runtime adapters (`aws-lambda`, `bun`, `cloudflare-*`, `lambda-edge`, `netlify`, `service-worker`, `vercel`) | 8 | Ported with the upstream's tests and each has a getting-started page. No gate of ours deploys to any of them. Ship as **experimental** in 1.0 (named so in the page and the package notes), or take them out until a gate exists. | must (decide) |
| `node-server` (`serve`, `serve-static`, `conninfo`, `register`) | 4 | Public, frozen. `node-server` now also exports `UpgradeHub` and `testWebSocket` (0.11): they need the same stability statement. | must |
| Ports: `db`, `db/sqlite`, `db/conformance`, `kv`, `kv/json`, `kv/db`, `kv/conformance` | 7 | `db` and `kv` public (spec 049 ports). The two `conformance` entries are for provider authors: no page names the subpath (the bring-your-own-tool guide goes through `add kv --suite`). | later |
| `door/host`, `door/protocol`, `door/page` | 3 | The door is for hosts that build their own door; `door/page` is the in-page script. Mark `experimental` (see 3). | must (decide) |
| `cordis/*` (router, router-http, state, state/react, inspect, node-server, db, db-sqlite, kv, kv-json, kv-db, door) | 12 | The Cordis forms are what generated apps and ACRYL use. Freeze after ACRYL's cut-over (Fork3's T007/T008) has run on them; until then a change may still be needed. In the docs under `docs/framework/cordis/`, the examples import the copy names (`acryl-router`, `acryl-node-server`), which only work inside an app's copied sources; the published form (`acrylblends/cordis/router`) appears in release notes and nowhere in `docs/framework`. | must (docs and freeze) |

Mechanism: a `exports` snapshot test already exists (`packages/framework/tests/package.test.mjs` compares `exports` with the table). Add a second list there, `PUBLIC` and `INTERNAL`, so a 1.0 change to either needs a visible edit.

## 2. The product a paying user starts with

| Item | What a user hits | Verdict |
| --- | --- | --- |
| **No upgrade path from 0.x** | `acrylblends add` copies a plugin's source into the app and refuses a plugin the app already has, so an app made with 0.7 keeps its copies of the router, the server and the door for ever. Migration guides exist for 0.3 and 0.4 only; releases 0.5 to 0.11 have release notes but no "how do I move my app". There is no `acrylblends upgrade` or diff command. | **must**: an `upgrade` command (shows what changed in each vendored plugin against the installed `acrylblends`, applies it per plugin, never overwrites a file the app edited without saying so), and one migration guide that ends at 1.0 |
| **Releases are not tagged** | The repository's git tags stop at `v0.2.5`; 0.3 to 0.11 were published to npm without a tag or a GitHub release. A user cannot map a version to a commit or find a changelog entry from the repo. | **must**: tag every published version, publish GitHub releases from `docs/release-notes/` |
| Template names are split | `create-acrylblends` offers `nodejs`, `notes`, `chat`, `acryl-app`; `acrylblends init --help` says `blank or agent`; `todo` exists only through `init --template todo`. A user reads two lists. | must (one list, in both helps and in the getting-started page) |
| Templates were verified by one agent run | `verify:packed` runs each template's own tests from the installed package, and M8 ran claude, codex and pi once each on the `agent` template. The manual real-agent gate `verify-coding-agent` for `notes` and `chat` was not part of the 0.9 to 0.11 evidence. | later (re-run `verify-coding-agent --preset notes` and `chat` against 1.0) |
| Node support | `engines` is `>=22.19.0`; docs say "verified on 22.19 and newer". CI runs Node 22 and 24 on Linux, macOS and Windows. Node 20 is not supported and Node 26 is untested. | must (state it in the README and the 1.0 notes; add Node 26 to CI when it is current) |
| Install warnings | `npm install` in an app that has `driver-pty` prints an `allow-scripts` warning for `node-pty`'s install script; the prebuilt binary loads without it, but a paying user reads the warning. | later (document it, or ship the prebuild check in `add driver-pty`) |
| Optional peers | `ws` (upgrades), `vitest` (suites), Cordis forms need `@deepseek-ai/cordis` and `schemastery`: all optional, none checked at install. A missing one fails at first use with a plain error (`WebSocket upgrades need the "ws" package`). | later (a `doctor` command that lists what the app uses and lacks) |
| `acrylblends` help and errors | `--help` lists `init`, `add`, `plugins`, `build-client`, `kv import`, `check-deps`; no `add driver-pty` hint, no `--version` of the vendored plugins. | later |

## 3. What is still experimental, and must be labelled

- **The door** (`.acryl/bin/acryl`, the page channel, `agent-panel`, `driver-pty`): development only by design (off with `NODE_ENV=production` or `ACRYL_DOOR=off`, loopback, per-run secret, audit log). It is the product's differentiator and the least battle-tested part: one real-agent run per agent on one template. **must**: a page "what runs in production and what does not" (the door, the panel and the PTY driver never start in production; the app's routes and plugins do), and a test that production mode mounts none of them (tests exist per plugin; no single gate states it).
- **Live plugin install** (`extensions`, `sandbox`, `builder`): the sandbox is a static scan plus an optional approval step, not an isolation boundary. A paying user will ask "can an agent break my app". **must**: say in the guide exactly what the sandbox does and does not stop, and keep `approval` easy to turn on.
- **Agent panel drivers**: `claude`, `codex` and `pi` are found on `PATH`; their flags change with their releases. **later**: a version note per driver in the page, and the manual gate `verify-pty-agents` as the check to rerun on each release of an agent.
- **Task recorder, state cells, conformance suites**: used by the templates and tested, but the API of `tasks` (kinds, details) is not documented as stable. **later**.

## 4. Known tickets and open work

| Item | Where | Verdict |
| --- | --- | --- |
| T007/T008 (ACRYL's cut-over on the new subpaths) | Fork3, ACRYL side | **must** before freezing `cordis/*` |
| T028 `driver-dsh` as a `chat` driver on the registry | Fork3, after M7 | later (the contract, `chat` drivers, ships in 0.10) |
| Door `brief` prints the address, the app guide names the plugin import | 0.11.0 | done |
| Re-run claude in the combined app after its weekly limit resets (M8 evidence) | this repository | later, optional |
| `HTTPException` is at `acrylblends/http-exception`, not the plain root | a user coming from the old docs looks in the wrong place (Fork3 hit it) | later (one line in the migration guide) |
| ACRYL-side docs sync | two sites (`acrylblends.github.io`, `acryl.dev`) copy `docs/framework` by hand, with release notes entered by hand into `doc-content.ts` | must (one script that does both, run from the release checklist in `docs/releasing.md`) |

## 5. Release gates for 1.0

`pnpm run check` already runs lint, build, framework verification, secrets scan, typecheck, tests, scaffolder, bring-your-own-tool, panel, PTY driver, packed-install and tarball checks, and CI runs the framework packages on Linux, macOS and Windows with Node 22 and 24. 1.0 adds:

1. The `PUBLIC` / `INTERNAL` subpath lists and the experimental labels (section 1).
2. `acrylblends upgrade` with a test that upgrades an app made by 0.9.1 and 0.10.0 (kept as fixtures) to the current version and runs its tests.
3. A tagged git release for every published version, from the checklist in `docs/releasing.md`.
4. A real-agent run (`verify-coding-agent` on `notes`, `chat`, `agent`; `verify-pty-agents` on the three agents) recorded for the release.
5. The "production versus development" page and its single test.

## Suggested order

1. Decide the three open questions in section 1: the `App` aliases, the eight non-Node runtime adapters (experimental or out), and `door/*` (experimental).
2. Remove the internal subpaths (`acryl-base`, `utils/*`) from `exports` and add the two lists to the exports test.
3. `acrylblends upgrade` and the migration guide (the biggest piece of work).
4. Docs: the `cordis/*` import names, the template list, the production page, the missing subpath pages.
5. Tags, GitHub releases and the one-script site sync.
6. After Fork3's T007/T008 run on 0.11: freeze `cordis/*` and cut 1.0.

## 6. Decisions (2026-10-28, from the owner's direction through the coordinator)

Node is the primary runtime and is public and gated; Bun is optional; Deno is dead.

1. **Runtime adapters.** Node is public. `bun` stays as **experimental**, with one smoke gate in CI. The other non-Node adapters (`aws-lambda`, `cloudflare-pages`, `cloudflare-workers`, `lambda-edge`, `netlify`, `service-worker`, `vercel`) come out of the 1.0 exports, because no gate deploys to them; they may return later as separate plugins, each with its own gate.
2. **`App` and `AppRequest`** are removed in 1.0, with a line in the migration guide.
3. **`utils/*` and `acryl-base`** are internal: out of `exports`, and the exports test holds explicit `PUBLIC` and `INTERNAL` lists.
4. **`door/*`, the agent panel, `driver-pty` and live plugin install** are labelled experimental and development-only, with a "what runs in production" page and a test. The page states exactly what the sandbox stops and what it does not.
5. **Template names** are one list, the same in `create-acrylblends` and `acrylblends init`; every template is available through both.

## 7. Order of work

| Step | Work | Status |
| --- | --- | --- |
| a | Git tags and GitHub releases for 0.3 to 0.11, backfilled from the commits of the published tarballs | done: 27 tags and 27 GitHub releases (acrylblends 0.3.0 to 0.11.0), 20 create-acrylblends tags |
| b | The exports cut and the `PUBLIC` / `INTERNAL` test | done: exports cut to 96 public subpaths (with `acrylblends/drivers`), PUBLIC / EXPERIMENTAL / INTERNAL lists and test, Bun smoke gate in CI |
| c | Docs: the published import names (`acrylblends/cordis/...`) everywhere; the unified templates | done: published import names in the docs, one template list in both commands |
| d | `acrylblends upgrade` (replace the vendored framework plugins in an app with the current version, show the diff, refuse when local edits would be lost unless `--force`), one migration guide to 1.0, an upgrade test on 0.9.1 and 0.10.0 fixtures | done: `acrylblends upgrade`, the lock, the hash history, the migration guide, tests and `verify:packed` on apps made by 0.9.1 and 0.10.0 |
| e | The experimental labels and the production page with its test | done: the door plugin gates itself on production, the production page, the labels, the production test |
| f | One site-sync script in the release checklist | done: `scripts/sync-sites.mjs` and the complete checklist in `docs/releasing.md` |
| g | Recorded real-agent runs on `notes`, `chat` and `agent` | |
| h | `1.0.0-rc.1` on the `next` tag, checked from the registry by the coordinator, then `1.0.0` only after Fork3's T007/T008 have run on 0.11.x | |
| i | `1.0.0` published as `latest` | done (tag `v1.0.0`, both sites live) |
| j | `1.0.1`: the `agent` template leaves its agent, builder and extensions rows out in production | see [After 1.0: tickets](framework-1-1-tickets.md) |
| k | `1.0.2`: the workshop fixes (registry starters from npm alone, the newcomer path, the chat template closed in production) | see [After 1.0: tickets](framework-1-1-tickets.md) |
