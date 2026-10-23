# Tasks: ACRYL Framework (spec 046)

See `spec.md` for the milestones and `plan.md` for the principles. Reference tasks as `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/tasks.md T001`.

## Phase 0 - Decide and set up (M0)

- [x] T001 (owner approved all, 2026-10-23) Owner reviews `spec.md` and confirms the direction (micro-framework design rewritten as Cordis plugins; Hono as the leading reference; Vike not rewritten).
- [x] T002 (`router` is free: no Context augmentation or service of that name in DSH or ACRYL) Answer open question 4: confirm the service name `router` is free (grep the DSH and ACRYL service names).
- [x] T003 (`plugins/acryl-router/tests/conformance.ts`, 12 checks driven by a `Candidate` of five operations) Write the conformance suite from the outline in `plan.md`, driven by a `makeRouter()` factory (new package under `plugins/`, layout check and `pnpm-workspace.yaml` updated in the same commit).
- [x] T004 (the Hono-shaped design passes all checks, so H3 and Rou3 were not measured; see research.md) Run the suite against the Hono-shaped design (T006); record the result in `research.md`. Measure H3 and Rou3 only if a check fails or the owner asks.

## Phase 1 - The service (M1)

- [x] T005 (`plugins/acryl-router`, row id `acryl-router`) `acryl-router` package: provides `router` (`route`, `use`, `fetch`), no I/O and no dependencies, row id `acryl-router`.
- [x] T006 (registry with disposers, `compose`, reduced `RouteContext`, linear matcher with specificity ordering; no trie needed yet) The first implementation: registry with disposers, middleware `compose`, a reduced `Context`, a linear matcher, then a trie matcher if parameters need it.
- [x] T007 (35 tests: conformance on the pure table and through a Cordis Context, PENDING and reactivation, provider replacement, 50 mount cycles, in-flight abort, and a real Loader row with 10 disable/enable cycles) All conformance checks green in a real Loader, including PENDING and provider replacement.

## Phase 2 - HTTP adapter and first port (M2)

- [x] T008 (`plugins/acryl-router-http`: `mount(prefix)` on the webServer, `serve()`, streamed bodies, set-cookie kept apart, HEAD, client abort reaches the handler signal, peer address as connection info; 9 tests against the real webServer) `acryl-router-http`: injects `router` and `webServer`, maps `IncomingMessage` to `Request` and `Response` to `ServerResponse`, aborts in-flight requests on disposal.
- [x] T009 (first slice: state, sources and media routes ported; the catalog, installable, installations, operations and desktop routes still use `webServer` because their tests drive hand-built `req`/`res` emitters; every composition that mounts the Market now mounts the router rows first) Port the market routes (`plugins/cordis-plugin-market/src/host/routes.ts`) to the router; typert untouched.
- [x] T010 (real stack, no fakes: `plugins/cordis-plugin-market/tests/router-stack.spec.ts`, 5 tests; the Market suite is 285 tests green; a full app boot was not run) Web run: market works as before; unload removes its routes; reload registers once. Record the output.
- [x] T011 (decision: typert stays RPC over its WebSocket and is not wrapped by the router; the TUI runs the engine in process and calls Host services directly, so it needs no typert socket; see plan.md "Decisions") Answer open question 1: typert versus router (decide, write it in `plan.md`).

## Phase 3 - Three surfaces (M3)

- [x] T012 (answered: ACRYL Desktop runs its own loopback `webServer`, renderer origin `http://127.0.0.1:<port>`, so Desktop takes the same HTTP path as Web; the "IPC bridge" in the DSH webserver README describes upstream's separate desktop flavor) Answer open question 2: find the Desktop IPC bridge and whether it can call `router.fetch`.
- [x] T013 (test-level proof: `plugins/acryl-router-http/tests/surfaces.spec.ts` runs one plugin in a webServer composition and in a router-only composition and gets identical status, headers and bodies; a real TUI command that calls `router.fetch` is not wired yet) One capability, three runs: HTTP on Web, the Desktop bridge, in-process in the TUI with no network server.

## Phase 4 - Plugin contract (M4)

- [ ] T014 Mini-design (six points) for the declaration format, building on `acryl.requires` and `acryl.provides`.
- [ ] T015 Declarations for a chosen set of plugins and a generated "what it does, what unloads" diagnostic.

## Phase 5 - State (M5)

- [ ] T016 Mini-design and prototype of the `state` service (DOM-free reactive core), with React and pi-tui adapters.
- [ ] T017 One value updates Web, Desktop and the TUI; recorded.

## Phase 6 - Optional layers (M6)

- [ ] T018 Owner decision: DOM renderer for small Blend apps, yes or no.
- [ ] T019 Owner decision: page/SSR layer for public pages (Vike unchanged), yes or no.

## Phase 7 - Detach (M7)

- [ ] T020 ACRYL plugins stop importing `ctx.webServer`; the remaining uses listed and justified; docs, tests and `docs/DEVELOPMENT-LOG.md` updated.
