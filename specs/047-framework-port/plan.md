# 047 - The framework core is a port, not a rewrite

Owner decision (2026-10-23): spec 046 built `acryl-router` as an original design shaped after a mature MIT web framework. The owner asked
for the real thing instead: take that framework's code and its test suite, make it ACRYL's own, and add only what Cordis needs. The
upstream copyright and permission notice lives in the package `LICENSE` and nowhere else (no README, docs or comment mentions it).

## What is ported

`plugins/acryl-router/src/core/`: the app, compose, context, request, the five routers (smart, reg-exp, trie, pattern, linear), the
validator, the helpers (streaming, cookie, html, accepts, conninfo, route, adapter) and the middleware set, plus their test suite
(2075 tests). Changes from upstream are mechanical: explicit `.ts` imports, enums as const objects (erasable TypeScript, so the source
runs in plain Node), the client and its type tests left out, names and test data renamed.

## Provenance (gate P1)

`plugins/acryl-router/provenance.json` records the upstream commit and, for every ported file, the upstream file's hash, our file's hash and the
reason for any change beyond the mechanical ones; `omitted` lists what is not ported yet. `node scripts/verify-port.mjs` (in `check:layout`)
fails when a ported file changed without the record being rewritten. With `--upstream <checkout>` it re-derives every file from the upstream
checkout and fails on any deviation without a reason; `--write <package>` rewrites the record after a deliberate change or an upstream sync.
The record and the script never spell the upstream name: the script reads it from the checkout's own `package.json`.

## Cordis mini-design: `acryl-router` on the ported core

1. **Capability and plugin boundary.** `acryl-router` owns HTTP-shaped routing for every surface. It is a plugin because a Blend can
   replace it, run without it, or reload it on its own. The ported core is a library inside it; the plugin adds plugin ownership.
2. **Provides and consumes.** Provides the `router` service. A plugin builds an ordinary `App` from `acryl-router` (the full upstream
   API and its type inference) and mounts it with `ctx.router.route(path, app)`. The router also takes a router-wide `onError` and
   `notFound`, and runs requests in process with `fetch(request, connection?)` and `request(input, init?, connection?)`. It consumes
   nothing. The `routerHttp` interface stays declared here so a plugin can ask for HTTP without depending on the adapter.
3. **Effects and disposal.** Every mount, `onError` and `notFound` is one `ctx.effect` on the caller's context, so it goes away when
   that plugin unloads. A change marks the composed app stale; the next request composes a fresh `App` from the live mounts in
   registration order (the routers build their matcher once, so a rebuild, not a mutation, is the only correct way to remove a route).
   The router's own effect, on disposal: refuse new requests with 503, abort every in-flight request's signal, cancel every response
   body still streaming (that runs the stream helpers' own `onAbort` cleanup), and wait for handlers, bodies and `waitUntil` tasks,
   bounded by `disposeGraceMs`.
4. **Configuration and composition.** `trailingSlash: 'strict' | 'ignore'` maps to the core's `strict` option; `disposeGraceMs` as
   before. Loader row id `acryl-router`, equal to the package name.
5. **Events and durability.** No events, no durable state. Transport facts travel beside the request, never in it: the adapter passes
   `{ remoteAddress, localPort }`, which the handler reads with `getConnInfo(c)` (the core's conninfo shape) or `c.env.connection`.
   `c.executionCtx.waitUntil(task)` keeps a request in flight. `c.req.raw.signal` aborts on caller abort and on disposal.
6. **Verification.** The ported suite; the ACRYL suites for service, Loader activation, disable and re-enable ten times, live install
   from a plugin, 50 reload cycles back to baseline; the adapter suites (HTTP and in-process give identical answers, streams end on
   unload); every consumer's suite (Market, state, inspect, todo, starter, node-server); a real isolated boot of the IDE Blueprint.

## The Node adapter (gate P5)

`plugins/acryl-node-server/src/adapter/` is the upstream project's Node adapter, ported with its test suite (`tests/adapter/`, 503 tests)
under the same provenance record and check (`plugins/acryl-node-server/provenance.json`; the upstream MIT notice is in that package's
`LICENSE`). The `nodeServer` service builds its server with the ported `createAdaptorServer` and keeps what the plugin owned before: the port
scan, the connection facts handed to `ctx.router.fetch`, and disposal that ends streams and frees the port. The platform's global `Request`
and `Response` stay in place (the adapter's `overrideGlobalObjects: false`); the adapter's lightweight request is made a real one with the
ported `Request` before the router sees it, so a client that goes away still aborts `c.req.raw.signal`. `serveStatic` is exported. The
WebSocket upgrade needs the raw `incoming` in the handler's bindings, which the router does not pass; it is a later task.

## Latency after a mount change (gate P6)

A mount change marks the composed app stale; the next request composes a fresh `App`. Measured with
`plugins/acryl-router/scripts/bench-remount.mjs` (in process, `router.request`, Node 24, Apple Silicon), median and p95:

| mounts x routes | steady state | first request after a change, default matcher | the same, trie router (shipped) |
| --- | --- | --- | --- |
| 20 x 10 | 32 us / 44 us | 2.1 ms / 2.7 ms | 0.22 ms / 0.30 ms |
| 50 x 20 | 31 us / 45 us | 21 ms / 23 ms | 0.81 ms / 2.5 ms |
| 100 x 20 | 33 us / 41 us | about 160 ms (one-off probe) | 1.5 ms / 4.1 ms |

The default matcher compiles one regular expression over every route on its first request, and that compile grows faster than the route
count. The router service therefore composes with the core's trie router, which rebuilds in about 1 ms per 1000 routes and matches as fast
in steady state (5 to 7 us for a bare app in the same probe). A plugin's own `App` keeps whatever router it chose; only the composed app
uses the trie.

## Framework app profile (gate P6)

`acryl-router/tsconfig.app.json` is the profile an app extends: ES2024 with the DOM and DOM.Iterable libs (the Web types the framework
names, such as `CryptoKey` in jwt), `strict`, NodeNext, without this repository's `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. `tsconfig.framework-app.json` at the root compiles the framework plugins and the todo example under it,
mapping the package names to their sources so no build is needed; `check:layout` runs it (`pnpm run check:framework-app`).

## Standalone (gate P6)

`corepack pnpm run verify:framework-standalone` packs `acryl-router`, `acryl-state`, `acryl-inspect` and `acryl-node-server`, installs the
tarballs in an empty folder beside nothing but Cordis, typechecks a 20-line app under `acryl-router/tsconfig.app.json`, runs it and requires
a 200 from a real socket and a clean exit. It found that `ctx.plugin(nodeServer, { port: 0 })` did not typecheck: a schemastery schema is
callable, so Cordis reads it as a config transform and takes its declared input, which was the full `Config`. The router's and the
adapter's schemas now declare the partial input (`z<Partial<Config>, Config>`), and the adapter's spec loads the module itself.

## Desktop (gate P7)

The same plugin serves the same routes on Desktop, through the same transport as Web. Desktop's window loads from the Host's own loopback web
server (`http://127.0.0.1:<port>/`), so `acryl-router-http` serves a plugin's prefix there exactly as on Web; `router.fetch` in process is not
needed for Desktop and stays the terminal's and the tests' path. A transport without a port is T014.

Proof, an isolated run (`scripts/live-run.mjs desktop --blueprint acryl.blank --no-key --inspect 9333 --copy-home <seed>`; own HOME, app home and
Electron user data, real homes checked unchanged): the seed home carries `examples/acryl-todo` in `plugins/`, the way a Blend carries its own
plugins, installed with `/reload new` typed in the window. Over Desktop's Host: POST 201 twice, PATCH 200, DELETE 204, GET 200 with the list, an
invalid body 400 with the issues, a foreign `Origin` 403, a foreign `Host` 403, and `/api/state/todo.list` 200 with the same list. The window
navigated to `/todo` rendered the page, and a todo added through the page's form appeared in the API. Stopped with "stopped, port free, real
homes untouched".

Found and fixed on the way: the installer's hot-reload wrapper assumed the entry sat at the package root and ignored conditional `exports`, so a
plugin with `lib/index.js` failed to activate; Desktop's own `/reload` collided with the plugin installer's `/reload` and failed its registration
at every boot (Desktop's is now `/restart`); `scripts/inspect-page.mjs` gained `type <text>`.

## Phase 8: moved

The IDE onto the framework (Phase 8) has its own spec: `specs/048-ide-on-framework/` (the slice method, the measures, slice 1's design and
evidence, and the tasks). This plan keeps the framework port.

## The public package (0.5.0)

The coordinator's order: the framework's public face is 1:1 with the upstream package, so a generated app's imports are the upstream ones
with the name swapped (`'<upstream>'` -> `'acrylblends'`, `'<upstream>/<x>'` -> `'acrylblends/<x>'`, the Node adapter ->
`'acrylblends/node-server'`).

- The class is `Acryl` and the request `AcrylRequest` (the mechanical rule in `scripts/verify-port.mjs` maps the upstream name to `Acryl` in
  identifiers); `App` and `AppRequest` stay one release as deprecated aliases (`plugins/acryl-router/src/deprecated.ts`). Code examples in
  ported comments import from `acrylblends`, and a commented `declare module` names `acrylblends`.
- `distribution/acrylblends-framework` (private, 0.5.0) builds the ported modules without Cordis into one dependency-free `lib/`, one entry
  per subpath. `subpaths.mjs` is the single table of subpaths and sources; `exports` is generated from it. ACRYLBLENDS vendors the packed
  tarball as the root of `acrylblends` 0.5.0. ACRYL's additions: `acrylblends/loopback-only`, `acrylblends/schema-validator`, and
  `connectionOf`/`RouterEnv`/`ConnectionInfo` beside `getConnInfo` in `acrylblends/conninfo`.
- Gates: the upstream suites (router 2591, node-server 511); the package tests (exports match the table, built files import only their own
  chunks and `node:`, the root and the routers import no Node built-in, every entry loads without Cordis); `verify:standalone` (the packed
  tarball installed under the public name in an empty folder serves the getting-started app on Node via `serve` (Bun informational, when installed), and a
  Node-types-only, no-DOM consumer typechecks every subpath and a `declare module 'acrylblends'` augmentation); provenance re-derived.

## ACRYL additions kept

- `loopbackOnly` middleware (Host must be loopback with the server's real port; a foreign or null Origin on a change is 403; `callers:
  'own-page'` admits only this app's own page, for private routes).
- `schemaValidator(target, schema)`: the core `validator` driven by any Standard Schema (Schemastery, Zod, Valibot).
- `getConnInfo(c)` for the ACRYL adapters.

## Tasks

- T001 Port the core and its test suite, green. Done.
- T001a Provenance record and check (P1). Done.
- T002 Rebuild the `router` service on the core (mounts, rebuild, flights, body cancellation), with its ACRYL tests. Done.
- T003 Port `loopbackOnly`, `schemaValidator`, `getConnInfo`; delete the original-design files and their tests. Done.
- T004 Migrate `acryl-router-http` and `acryl-node-server`. Done.
- T005 Migrate `acryl-state`, `acryl-inspect`, the Market, `acryl-todo`, the starter. Done.
- T006 Rewrite `docs/framework/` and `docs/acryl/FRAMEWORK.md` for the new API (P4). Done.
- T007 Gates, a real isolated boot, commit, CI.
- T015 Prove the framework on Desktop (P7). Done.
- T008 Port the Node adapter and its suite into `acryl-node-server`, rebuild `nodeServer` on it (P5). Done.
- T013 End the requests and streams a plugin's code is serving when its mount is removed, as 0.3.0 did, not only when the router is
  disposed: each mounted handler is wrapped to record which mount a request is in and which mount produced its body. Done.
- T018 The public names: `Acryl`/`AcrylRequest`, `App`/`AppRequest` deprecated aliases, comment examples on `acrylblends` subpaths. Done.
- T019 The release package `distribution/acrylblends-framework` 0.5.0 and its standalone gate. Done.
- T016 and T017 moved to `specs/048-ide-on-framework/tasks.md` (T001 and T005 there).

## After 0.4.0

Part B order (coordinator, 2026-10-24): presets and the router subpaths; mount, cache, proxy and dev; jsx with jsx-renderer, css and
streaming; ssg; the remaining host adapters; the bun adapter last. Node is the target runtime; the deno adapter is out of scope (owner).

- T009 Port the proxy helper and the WebSocket adapters; pass the raw socket bindings through `router.fetch` so `upgradeWebSocket` works
  under the router.
- T010 Port jsx and jsx-renderer, ssg, css, the cache and mount middleware, and the dev helper, each with its tests. Done, with the
  presets and the proxy helper; the port check now also fails on the upstream name inside a longer identifier.
- T020 Run `.tsx` apps on Node without a build step: `acrylblends/node-server/register`, a module load hook that compiles JSX files with
  the app's own `typescript`. Done.
- T011 Port the remaining docs pages.
- T012 Move the Host bridge in `acryl-router-http` onto the ported request listener, so one listener implementation serves both adapters.
- T014 A Desktop transport without a port: serve `ctx.router.fetch` through Electron's `protocol.handle` (Web `Request` in, `Response`
  out), measured against the loopback HTTP path Desktop uses today.
- T021 Real hydration in `acrylblends/jsx/dom`: `hydrateRoot` adopts the server's nodes (walk them alongside the first render, attach
  handlers and state, replace only where they differ) instead of rendering and replacing the children, so focus, selections and typed
  text survive. Today it is `createRoot` plus `render`, documented as such in `docs/framework/guides/client-modules.md` and checked in
  headless Chrome by the standalone gate (the server button is replaced). Scheduled after the Electron slice (coordinator, 2026-10-25).
- [x] T022 (done 2026-10-27: `plugins/acryl-router/src/helpers/read-sse.ts`, `acrylblends/read-sse`, served to the browser by `clientModules`) `readSSE(response)` for the browser: an async iterator over the events of a `text/event-stream` answer from `fetch`, for POST
  streams that `EventSource` (GET only) cannot read. ACRYL's own addition, not part of the upstream port, so it lives in its own subpath
  with its own tests and is marked as an addition in provenance.json. Found by the chat gate (Blends, 2026-10-25): every builder wrote the
  same fetch + reader + parse loop. Scheduled after spec 049 slice 1 (coordinator, 2026-10-25).
- [x] T023 (done 2026-10-27: it behaves the same as the upstream at the pinned commit, so it is documented and tested on both paths, not changed: `plugins/acryl-router/tests/stream-abort.spec.ts`, the socket case in `plugins/acryl-node-server/tests/server.spec.ts`, and the streaming helper page) `stream.aborted` and `c.req.raw.signal`: under `app.request`, aborting the request fires `c.req.raw.signal` but leaves
  `stream.aborted` false; only cancelling the body reader fires `stream.onAbort`. First check what the upstream does at the pinned commit.
  If it behaves the same, document it and leave it as is. Change it only with a recorded deviation and tests on both the in-process and
  the socket paths. Found by the chat gate (Blends, 2026-10-25). Scheduled with T022.
- [x] T024 (done 2026-10-27, Blends: `plugins/acryl-router/src/service.ts` `snapshot`, tests `plugins/acryl-router/tests/subapp-basepath.spec.ts` and the router case in `plugins/acryl-node-server/tests/client-modules.spec.ts`) `basePath(c)` lost the prefix of an app nested in another app that is mounted on the router.
  `new Acryl().route('/client', clientModules(...))` mounted with `ctx.router.route('/', thatApp)` answered 404 for every file: the router's `snapshot` re-registered each route with `tagged.on(...)`, which gives it the base path of `tagged`
  (`/`), so `basePath(c)` was `/` and `clientModules` cut nothing off the request path (`/client/counter.tsx` was looked up as a file named `client/counter.tsx`). The core alone was right (`app.request`), and so was `ctx.router.route('/client', clientModules(...))`
  mounted directly, which is why the unit tests passed. Found by the notes and chat Cordis templates (slice 16). Fix: keep each route's own `basePath` in `snapshot`. The failing tests were written first (router: the nested cases returned `/|tools/a/b`;
  node-server: a `clientModules` nested in a sub-app answered 404 through the router) and fail again with the fix removed. Every user who nests `clientModules` (or any handler that reads `basePath(c)`) in a sub-app was affected.
- [ ] T025 (open, Blends, 2026-10-27) Cancel a running agent run. `Agent.run(question)` of `plugins/agent` has no way to stop a run that has started: it takes no `AbortSignal`, and the run's task id (`RunResult.task`) is only known when the run is over. The agent panel (acrylblends 0.8.0, `plugins/agent-panel`) therefore cannot honour its Stop button for the app's own agent: it ends the server-sent stream, and the run finishes in the background (its tool calls still happen, a plugin may still be installed). Wanted: `run(question, { signal })`, and the same through the `tasks` recorder (`cancel(id)` already exists for a task), so that an aborted signal stops the model call in flight, runs no further tool, rolls back an install that has not finished, and ends the run as `{ status: 'cancelled' }` (the type already has that case). Tests: an abort during a model call, during a tool call, and before the first step; the panel's Stop for `driver: 'agent'` then stops the run (a test in `plugins/agent-panel/test`). The release notes of 0.8.0 name the gap; remove the sentence when this lands.
