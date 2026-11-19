# 015: Adopt the ACRYL framework core

Status: shipped as acrylblends 0.3.0 (docs/release-notes/0.3.0.md); `0.3.0` is deprecated on npm and superseded by 0.5.0. The vendoring mechanism it introduced (sync script, `upstream.json` records with a commit and a digest, `verify:framework`) is how every later release took the framework, the docs, the todo template and the package README from ACRYL; since 0.5.0 the framework is also vendored as a built package (`packages/cli/lib`, record in `packages/cli/framework.json`). Written against acrylblends `main` at `55867be` and ACRYL
branch `046-acryl-framework` at `1fdd2115` (read only).

## Decisions (coordinator, 2026-10-23)

1. The standalone listener is a separate ACRYL plugin, `acryl-node-server` (the standalone server that puts the router on `node:http`), built by ACRYL, not a mode of `acryl-router-http`. It must keep everything `server` does today (port scan of 20, loopback default, 400 on bad JSON, 15 s keepalive, clean close). It is vendored like the others; `server` goes away once it lands. acrylblends builds no `webServer`-shaped port.
2. A clean 0.3.0 with no `http` compatibility plugin.
3. Templates `blank`, `todo`, `agent`; `--agent` stays as an alias of `--template agent`.
4. Vendoring as described in section 5. A needed change goes upstream to ACRYL first, then is re-synced here; a vendored file is never edited in this repository.
5. Nothing is pushed or published until the coordinator confirms the release; publishing 0.3.0 is the owner's call.

Findings while implementing (2026-10-23):

- `acryl-router-http` is not vendored. It serves through the DSH `webServer`, which a generated app does not have, and `acryl-node-server` replaces it. The vendored set is `acryl-router`, `acryl-state`, `acryl-inspect` (and `acryl-node-server` when it exists).
- Upstream tests that need packages a generated app lacks are copied but not run here, each with its reason recorded in `upstream.json` (`testsNotRun`): the real-Loader test (it loads a built `lib/` entry) and the React test. `src/react.ts` is vendored but not copied into apps (`omit` in `plugin.json`), because an app without React could not type-check it.
- Notices: the sync copies a LICENSE or NOTICE file when a framework plugin has one. At ACRYL 11fed295 the plugins carry only their own LICENSE; the framework is ACRYL's own code.
- The digest is `digestFolder`'s algorithm over the vendored paths only (a plugin folder also holds `plugin.json` and `upstream.json`, which are ours).

## Goal

ACRYLBLENDS becomes the public ACRYL framework: `npx acrylblends init` gives a stranger an app built on ACRYL's router, state and inspector (written as
Cordis plugins, spec 046 in ACRYL), plus what acrylblends already has (instance, settings, live extensions, agent, tasks, manifest, save).

## 1. What acrylblends serves HTTP with today, and what the router replaces

Three small plugins, 244 lines in all:

| Plugin | Lines | What it does |
|---|---|---|
| `http` | 64 | A route table. `ctx.http.route(method, path, handler)` returns its remover; the key is the exact string `METHOD /path`. A handler gets `{ method, path, body }` and answers `{ status?, body, stream? }`, always JSON. No path parameters, no query, no headers, no middleware. `handle()` answers a request in process; `list()` names the routes. |
| `server` | 138 | The `node:http` listener over `http`: port from the instance (stable per app, next free one when taken, up to 20 tries), loopback by default, JSON body parse with a 400 on bad JSON, server-sent streams with a 15 s keepalive, closes on dispose. |
| `events` | 42 | `GET /events`: Cordis events as a server-sent stream, per configured topic, listeners removed when the client leaves. |

Who uses them (measured with grep, not from memory):

- `packages/cli/templates/app/src/routes.ts` and `agent/src/routes.ts` (`/`, `/health`, `/extensions`, `/tasks`, `/tasks/cancel`, `/ask`) and the two `app.ts` files that mount `http`, `server`, `events`.
- `plugins/builder/script.ts` generates the plugin the offline agent writes for `create route hello /hello Hello`; it calls `http.route`.
- `plugins/openai/prompt.ts` teaches a real model the extension contract with `http.route` and `http.handle` (the optional `check`). This is the "/hello" the agent installs.
- Tests that import them: `plugins/{http,server,events}/test`, `plugins/builder/test`, and the template tests; `scripts/verify-scaffolder.mjs` drives `/ask`, `/events`, `/hello` against generated apps.

What the router replaces:

- `http` is replaced by `acryl-router` (Web-standard Request and Response, path parameters, middleware, in-process `fetch(Request)` for tests).
- `events` is replaced by `acryl-state` (a cell and its server-sent stream). `GET /events` of tasks and extensions becomes cells that the agent template publishes.
- `server` is replaced by the HTTP adapter, with one gap. As built today, `acryl-router-http` serves through the DSH `webServer` service (`inject = ['router', 'webServer']`; the spec calls detaching from it milestone M7). An acrylblends app has no DSH, so it has no `webServer`. Two ways to close the gap, and I recommend the first:
  1. ACRYL adds a standalone mode to the adapter (it owns a `node:http` listener when there is no `webServer`). It must keep what `server` does today and the verify script depends on: instance port with scan, loopback default, 400 on bad JSON, 15 s keepalive, clean close. The lines move out of acrylblends; our `server` plugin disappears.
  2. acrylblends keeps `server` and gives it a `webServer`-shaped port (`register({ kind: 'prefix', path, handler })`). Works with the adapter unchanged, but keeps a second listener implementation here.
- Breaking change: an extension written against `ctx.http` stops loading, and the model prompt and the offline script teach the old API. The package was published three days ago and the router API is the better contract, so the plan is a clean break in 0.3.0, the prompt and `builder/script.ts` rewritten to `ctx.router`, and an optional 25 line `http` compatibility plugin if anyone shows up with an app built on 0.2.x. The agent's `check` becomes `ctx.router.fetch(new Request(...))`.

## 2. Which acrylblends plugins map to the framework layout

Only the HTTP trio changes. The rest never touch `http` (checked: `extensions`, `tasks`, `agent`, `sandbox`, `settings`, `instance`, `manifest`, `save` import neither `http` nor `server`).

| Plugin | Decision |
|---|---|
| `instance` | Stays. It decides home and port; the adapter's standalone mode reads its port preference. |
| `settings` | Stays (still a copy of `acryl-settings` until ACRYL publishes it as a package). |
| `extensions` | Stays. Live install, ledger, approval, rollback are unchanged. Its routes live in the template and are re-written on the router. |
| `builder`, `agent`, `openai`, `sandbox` | Stay. Two text touchpoints: `builder/script.ts` and `openai/prompt.ts` teach `ctx.router`. |
| `tasks` | Stays. It additionally publishes a state cell so `GET /events` comes from `acryl-state`, not from our own `events` plugin. |
| `manifest`, `save` | Stay (already thin over `@webboxes/blends-core` and `@webboxes/app-persistence`). New rows for the router plugins are added to `blend.yaml`. |
| `http`, `server`, `events` | Removed once the router, the adapter (standalone) and state replace them. |
| New in the library | `acryl-router`, `acryl-router-http`, `acryl-state`, `acryl-inspect`, vendored from ACRYL (section 5). |

## 3. Templates

`init` offers three templates through `--template blank|todo|agent` (`--agent` stays as an alias for `agent`):

- `blank`: `instance`, router, adapter, `manifest`, `save`, an app plugin with `GET /` and `GET /health` on the router, a test that uses `router.fetch`.
- `todo`: `blank` plus `acryl-state` and the validate helper: CRUD on `/todos`, a server-sent stream, persisted to a file in the app home. Its source is ACRYL's `examples/acryl-todo` (the reference app), copied by the same sync script, not rewritten here.
- `agent`: today's agent template, re-based on the router. The offline `create route` demo and `/ask`, `/tasks`, `/extensions` keep working; `verify-scaffolder` keeps proving them.

Both `blank` and `todo` depend at run time only on `@deepseek-ai/cordis`, `yaml`, `@deepseek-ai/schemastery` (the router's validation) and the shared `@webboxes/*` packages, with no React in the install (acryl-state declares React as an optional peer).

## 4. Docs

`docs/` takes a conventional shape: `README`, `getting-started`, `concepts/`, `api/`, `guides/`, `middleware/`, plus two sections of our own: `agent/` (extending a running app, the builder, tasks) and `blends/` (the manifest, the lock, the registries). The framework pages (concepts, api, guides, middleware) are ACRYL's `docs/framework/` text, copied by the sync script into `docs/framework/` and marked generated (never edited here), so there is one text. Our pages link into it. `docs/test/docs.test.ts` (it executes every example) keeps running over the copied pages, which turns ACRYL's examples into a test on our side too. The site docs on acrylblends.github.io are rebuilt from this tree; no page is written twice.

## 5. One source of truth

Position: the source lives in ACRYL `plugins/` (as Fork3 built it), and the acrylblends library vendors it. Reasons from the code:

- The real conformance runs in ACRYL: the router already backs the Market and is exercised by Web, Desktop and the TUI there. A copy that is only tested inside acrylblends tests less than the original.
- ACRYL cannot depend on a repository whose job is to be a thin scaffolder; the reverse (a copy in the scaffolder) matches the extraction pattern this repository already uses for `settings` and `instance`.
- The source runs unbuilt under Node's type stripping: I imported all four `src/index.ts` files directly in Node 24.19 and they load. So vendoring is a copy of `src/`, with no build step in our repository.

Mechanism, the same extraction pattern with a drift check:

- `scripts/sync-framework.mjs <acryl checkout>` copies `src/` and `tests/` of the four plugins into `plugins/<name>/`, plus the todo example and `docs/framework/`. It rewrites exactly one thing: package specifiers between the vendored plugins (`acryl-router`, `acryl-router/middleware`, `acryl-router/helpers`, six imports in all) become relative paths, because the vendored plugins sit side by side in `src/plugins/` of an app. It writes `plugins/<name>/upstream.json` with the ACRYL repository, commit and a digest of what it wrote.
- `scripts/verify-framework-sync.mjs` recomputes that digest (the algorithm of `digestFolder` in `@webboxes/blends-core`, over the vendored paths) and fails when a vendored file differs from the recorded digest (someone edited a copy). With `--against <checkout>` it also fails when the checkout has moved ahead of the recorded commit. It runs inside `pnpm run check` and in CI.
- Rule: a vendored file is never edited here. A fix is made upstream and re-synced. The app's `blend.lock.json` already records each copied plugin as a `local` module with its digest, so an app can tell which framework version it was made from.

The alternative I considered and do not recommend: install the four packages from npm like `@webboxes/blends-core`. For libraries nobody edits (a parser, a lock writer) npm is right and we use it. The framework plugins are different: they are the app's own structure, the builder agent reads them to write plugins, and ACRYL ships them as `lib/` builds only (`files: ["lib/**"]`), so an agent in a generated app could not read their source. If the owner prefers npm anyway, the cost is publishing four packages and shipping `src/`; the spec would change in sections 3 and 5 only.

Open question for ACRYL (blocks section 1, option 1): who adds the standalone listener to `acryl-router-http`, and under which name.

## 6. The gate

A stranger, in an empty folder outside both repositories, from the packed or the published package:

```sh
npx acrylblends init todo --template todo
cd todo
npm install
npm test
npm run dev        # prints its URL
curl -X POST <url>/todos -H 'content-type: application/json' -d '{"title":"write the spec"}'
curl <url>/todos   # the new todo is listed
# stop the app, run npm run dev again
curl <url>/todos   # the todo is still there
```

and the CRUD is complete (create, list, get one, update, delete, a 400 or 422 on invalid input, the stream shows a change). This is run as a scripted transcript like the earlier stranger test, plus the existing checks stay green: `pnpm run check`, the scaffolder verification (all three templates, the agent building a plugin live), the sync check, and the docs tests.

## Out of scope

Replacing `settings` with a published package, React or Vite in templates, the Market, anything in WebBoxes.

## Listener shape (coordinator, final)

`acryl-node-server` is a standalone server over `router.fetch`: `inject = ['router']`, one `node:http` listener, every request goes to `router.fetch`, it provides `nodeServer` `{ url, port, hostname }`, config `{ port, hostname = '127.0.0.1', scan = 20 }`, it serves the whole router (no prefix mounting). The bad-JSON 400 lives in `readJson` and `validate`, the SSE keepalive in `streamSSE`. Fork3 builds it and messages the first commit and the mount line.

## Tasks

| # | Task | State |
|---|---|---|
| T1 | Vendor router, state, inspect with a sync script and a drift check | done |
| T2 | Builder script and model prompt write router plugins, tested in process | done |
| T3 | `tasks` publishes a state cell | done |
| T4 | Docs in one tree, framework pages generated from ACRYL | done |
| T5 | `init --template blank\|agent` (the `app` template is now `blank`); `--agent` and `--no-agent` stay as aliases | done |
| T6 | Vendor `acryl-node-server`; re-base `blank` and `agent` on router, state and the listener; remove `http`, `server`, `events`; `verify:scaffolder` green again | waiting for the listener |
| T7 | `todo` template: ACRYL's `examples/acryl-todo` copied by the sync script (specifiers rewritten for the app layout), our own `node:test` file for CRUD and the restart | waiting for the listener |
| T8 | When Fork3 fixes `ctx.router` in a plugin installed live (a fresh install currently throws "cannot get property router without inject" while `ctx.get('router')` works), switch the generated code and the model prompt back to `ctx.router` so the docs and the code agree | waiting for the upstream fix |
| T9 | Notices travel with the vendored plugins (the sync copies them; none is owed today) | done |
| T10 | Site docs: rebuild the framework pages from this tree; 0.3.0 release notes; the stranger gate of section 6 | after T6 and T7 |

## Order of work (each step ends in a gate)

1. Vendoring: sync and verify scripts, the four plugins in the library, library tests green on the copies.
2. Adapter decision (section 1) and the standalone listener, wherever it lives.
3. Re-base `blank` and `agent` on the router, rewrite `builder/script.ts` and `openai/prompt.ts`, remove `http`, `server`, `events`; scaffolder verification green.
4. `todo` template from the example.
5. Docs tree and the site.
6. Version 0.3.0, the stranger gate from section 6, publish.
