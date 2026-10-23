# Tasks: ACRYL Framework (spec 046)

See `spec.md` for the milestones and `plan.md` for the principles. Reference tasks as `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/tasks.md T001`.

## Phase 0 - Decide and set up (M0)

- [ ] T001 Owner reviews `spec.md` and confirms the direction (micro-framework design rewritten as Cordis plugins; Hono as the leading reference; Vike not rewritten).
- [ ] T002 Answer open question 4: confirm the service name `router` is free (grep the DSH and ACRYL service names).
- [ ] T003 Write the conformance suite from the outline in `plan.md`, driven by a `makeRouter()` factory (new package under `plugins/`, layout check and `pnpm-workspace.yaml` updated in the same commit).
- [ ] T004 Run the suite against the Hono-shaped design (T006); record the result in `research.md`. Measure H3 and Rou3 only if a check fails or the owner asks.

## Phase 1 - The service (M1)

- [ ] T005 `acryl-router` package: provides `router` (`route`, `use`, `fetch`), no I/O and no dependencies, row id `acryl-router`.
- [ ] T006 The first implementation: registry with disposers, middleware `compose`, a reduced `Context`, a linear matcher, then a trie matcher if parameters need it.
- [ ] T007 All conformance checks green in a real Loader, including PENDING and provider replacement.

## Phase 2 - HTTP adapter and first port (M2)

- [ ] T008 `acryl-router-http`: injects `router` and `webServer`, maps `IncomingMessage` to `Request` and `Response` to `ServerResponse`, aborts in-flight requests on disposal.
- [ ] T009 Port the market routes (`plugins/cordis-plugin-market/src/host/routes.ts`) to the router; typert untouched.
- [ ] T010 Web run: market works as before; unload removes its routes; reload registers once. Record the output.
- [ ] T011 Answer open question 1: typert versus router (decide, write it in `plan.md`).

## Phase 3 - Three surfaces (M3)

- [ ] T012 Answer open question 2: find the Desktop IPC bridge and whether it can call `router.fetch`.
- [ ] T013 One capability, three runs: HTTP on Web, the Desktop bridge, in-process in the TUI with no network server.

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
