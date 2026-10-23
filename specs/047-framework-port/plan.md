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

## ACRYL additions kept

- `loopbackOnly` middleware (Host must be loopback with the server's real port; a foreign or null Origin on a change is 403).
- `schemaValidator(target, schema)`: the core `validator` driven by any Standard Schema (Schemastery, Zod, Valibot).
- `getConnInfo(c)` for the ACRYL adapters.

## Tasks

- T001 Port the core and its test suite, green. Done.
- T001a Provenance record and check (P1). Done.
- T002 Rebuild the `router` service on the core (mounts, rebuild, flights, body cancellation), with its ACRYL tests. Done.
- T003 Port `loopbackOnly`, `schemaValidator`, `getConnInfo`; delete the original-design files and their tests. Done.
- T004 Migrate `acryl-router-http` and `acryl-node-server`. Done.
- T005 Migrate `acryl-state`, `acryl-inspect`, the Market, `acryl-todo`, the starter. Done.
- T006 Rewrite `docs/framework/` and `docs/acryl/FRAMEWORK.md` for the new API.
- T007 Gates, a real isolated boot, commit, CI.
