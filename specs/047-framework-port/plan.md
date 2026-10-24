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

## Phase 8: the IDE onto the framework, one webServer user per slice

Each slice takes the largest remaining user of the DSH `webServer`, ports its routes onto `App` + `ctx.router.route` + `routerHttp.mount`,
deletes what becomes dead, and measures two numbers before and after: webServer registration call sites in production source
(`register`/`registerUpgrade` on `acrylWeb`, `webServer` or a `web` port, outside tests) and the layout gate's DSH import lines.

### Slice 1: `acryl-workspace` (T016)

Cordis mini-design:

1. Capability and boundary: unchanged. `acryl-workspace` owns files, git, terminals, projects, agents and the brief; only its transport
   moves. A small owned helper (`src/private-route.ts`) holds what every route shares, not a generic utils folder.
2. Provides and consumes: injects `router` and `routerHttp` (hard: every route is served through them) beside `acrylWeb` (its port is the
   agent-hook address, and the terminal WebSocket stays a webServer upgrade until T009), `appInstance` and `acrylSettings`. Provides
   nothing new; `sharedContext`, the tools and the chat context are unchanged.
3. Effects and disposal: the services effect builds the app; `route('/')` and `mount('/api/acryl-workspace')` come after it, so on unload
   the mount goes first (its requests and event streams end and are waited for, bounded by the router's grace) and then the PTYs, git and
   the registry are released. The project event stream's keep-alive is one plugin-owned timer (`createKeepAlive`, stopped in the effect),
   not one per request.
4. Configuration and composition: row id `acryl-workspace` unchanged. A Blueprint with the `workspace` capability must carry the
   `framework-kit` row, which brings the router rows; `parseBlueprint` refuses it otherwise, so the workspace cannot sit PENDING silently.
   Every built-in Blueprint with the workspace has the kit (tested).
5. Events and durability: none changed.
6. Verification: `tests/plugin.spec.ts` activates the plugin on real Cordis with the real router and router-http over a loopback
   `webServer`: one prefix mount and no exact routes, PENDING without a router and active when one appears, the mount and upgrade gone on
   unload, three reloads without duplicates. Every route test runs through the real adapter (`tests/serve-api.ts`); the event stream is
   mounted on the real router and ends when the mount is removed.

Measured (this branch, before and after the slice):

| | before | after |
| --- | --- | --- |
| webServer registration call sites, all packages | 30 | 19 |
| of them in `acryl-workspace` | 12 (24 exact routes and 1 upgrade) | 1 (the terminal upgrade) |
| DSH import lines (layout gate) | 133 (104 outside the seam) | 133 (104 outside the seam): the old routes used ACRYL's own `acryl-loopback-http`, not DSH, so this slice could not lower it |

Answers that changed, recorded in `docs/framework/migration-from-dsh-webserver.md`: an oversized body is 413 on every route, a wrong method
405 with `Allow` on every route, a missing or wrong agent-hook token 401 (was 403), and the hook's `Host` must be the app's loopback address.

Found on the way: the PTY registry runs the user's login shell synchronously when it is built (`$SHELL -lic 'echo $PATH'`), about 1.2 s with
an interactive zsh, and it blocks the Host's event loop on every activation of the plugin (Desktop boot and every reload). T017.

Also found: the router labeled a mount with every route it serves in one string, so the workspace's mount (24 routes and their
middleware) made a label longer than the 512 characters the Host's Cordis architecture inspector accepts, and that page answered 500. A
mount is now labeled `acryl-router: route <path>` with one child effect per route (`acryl-router: serves <METHOD> <path>`), so no label
grows with an app; `acryl-inspect` reads the children and does not count them as registrations of their own.

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
- T016 Phase 8 slice 1: `acryl-workspace`'s routes onto the router (see Phase 8). Done.
- T017 Find the terminal's PATH without blocking: ask the login shell asynchronously once, cache the promise, and make the callers that
  need it (`start`, `canRun`) wait for it, so activating the workspace never blocks the Host's event loop.

## After 0.4.0

- T009 Port the proxy helper and the WebSocket adapters; pass the raw socket bindings through `router.fetch` so `upgradeWebSocket` works
  under the router.
- T010 Port jsx and jsx-renderer, ssg, css, the cache and mount middleware, and the dev helper, each with its tests.
- T011 Port the remaining docs pages.
- T012 Move the Host bridge in `acryl-router-http` onto the ported request listener, so one listener implementation serves both adapters.
- T014 A Desktop transport without a port: serve `ctx.router.fetch` through Electron's `protocol.handle` (Web `Request` in, `Response`
  out), measured against the loopback HTTP path Desktop uses today.
