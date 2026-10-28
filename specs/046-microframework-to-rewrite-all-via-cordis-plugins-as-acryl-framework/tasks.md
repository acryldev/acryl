# Tasks: ACRYL Framework (spec 046)

See `spec.md` for the milestones and `plan.md` for the principles. Reference tasks as `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/tasks.md T001`.

## Phase 0 - Decide and set up (M0)

- [x] T001 (owner approved all, 2026-10-23) Owner reviews `spec.md` and confirms the direction (micro-framework design rewritten as Cordis plugins; Reference A as the leading reference; Vike not rewritten).
- [x] T002 (`router` is free: no Context augmentation or service of that name in DSH or ACRYL) Answer open question 4: confirm the service name `router` is free (grep the DSH and ACRYL service names).
- [x] T003 (`plugins/acryl-router/tests/conformance.ts`, 12 checks driven by a `Candidate` of five operations) Write the conformance suite from the outline in `plan.md`, driven by a `makeRouter()` factory (new package under `plugins/`, layout check and `pnpm-workspace.yaml` updated in the same commit).
- [x] T004 (the reference-shaped design passes all checks, so H3 and Rou3 were not measured; see research.md) Run the suite against the reference-shaped design (T006); record the result in `research.md`. Measure H3 and Rou3 only if a check fails or the owner asks.

## Phase 1 - The service (M1)

- [x] T005 (`plugins/acryl-router`, row id `acryl-router`) `acryl-router` package: provides `router` (`route`, `use`, `fetch`), no I/O and no dependencies, row id `acryl-router`.
- [x] T006 (registry with disposers, `compose`, reduced `RouteContext`, linear matcher with specificity ordering; no trie needed yet) The first implementation: registry with disposers, middleware `compose`, a reduced `Context`, a linear matcher, then a trie matcher if parameters need it.
- [x] T007 (35 tests: conformance on the pure table and through a Cordis Context, PENDING and reactivation, provider replacement, 50 mount cycles, in-flight abort, and a real Loader row with 10 disable/enable cycles) All conformance checks green in a real Loader, including PENDING and provider replacement.

## Phase 2 - HTTP adapter and first port (M2)

- [x] T008 (`plugins/acryl-router-http`: `mount(prefix)` on the webServer, `serve()`, streamed bodies, set-cookie kept apart, HEAD, client abort reaches the handler signal, peer address as connection info; 9 tests against the real webServer) `acryl-router-http`: injects `router` and `webServer`, maps `IncomingMessage` to `Request` and `Response` to `ServerResponse`, aborts in-flight requests on disposal.
- [x] T009 (all ten Market routes are on the router; the Market no longer injects `webServer` and its authority check reads the adapter's real `localPort` and peer address; every composition that mounts the Market mounts the router rows first; the test files that drove hand-built `req`/`res` emitters now call the routes in process through `callRoute`; the DSH import ceiling fell to 133 and 104) Port the market routes (`plugins/cordis-plugin-market/src/host/routes.ts`) to the router; typert untouched.
- [x] T010 (real stack, no fakes: `plugins/cordis-plugin-market/tests/router-stack.spec.ts`, 5 tests; the whole Market suite is 285 tests green over all ten routes; a full app boot was not run) Web run: market works as before; unload removes its routes; reload registers once. Record the output.
- [x] T011 (decision: typert stays RPC over its WebSocket and is not wrapped by the router; the TUI runs the engine in process and calls Host services directly, so it needs no typert socket; see plan.md "Decisions") Answer open question 1: typert versus router (decide, write it in `plan.md`).

## Phase 3 - Three surfaces (M3)

- [x] T012 (answered: ACRYL Desktop runs its own loopback `webServer`, renderer origin `http://127.0.0.1:<port>`, so Desktop takes the same HTTP path as Web; the "IPC bridge" in the DSH webserver README describes upstream's separate desktop flavor) Answer open question 2: find the Desktop IPC bridge and whether it can call `router.fetch`.
- [x] T013 (test-level proof: `plugins/acryl-router-http/tests/surfaces.spec.ts` runs one plugin in a webServer composition and in a router-only composition and gets identical status, headers and bodies; a real TUI command that calls `router.fetch` is not wired yet) One capability, three runs: HTTP on Web, the Desktop bridge, in-process in the TUI with no network server.

## Phase 4 - Plugin contract (M4)

- [x] T014 (decided: the contract is derived from the running system, not declared a second time; see plan.md "Decisions"; the static `acryl.requires` and `acryl.provides` stay for catalogs) Mini-design (six points) for the declaration format, building on `acryl.requires` and `acryl.provides`.
- [x] T015 (`plugins/acryl-inspect`: `ctx.inspect.plugins()`, `explain(name)`, `render()` and `GET /api/inspect/plugins[/:name]`; its "removes N registrations" promise is checked against what the router really lost; 10 tests; applying the label convention to the existing plugins is not done) Declarations for a chosen set of plugins and a generated "what it does, what unloads" diagnostic.

## Phase 5 - State (M5)

- [x] T016 (`plugins/acryl-state`: cells, derived cells, `useCell` for React, read-only JSON and server-sent-event routes on the router; mini-design below in plan.md) Mini-design and prototype of the `state` service (DOM-free reactive core), with React and pi-tui adapters.
- [x] T017 (three recorded runs: in-process subscription for the terminal path, real HTTP server-sent events through the actual webServer for Web and Desktop, and `useCell` under jsdom for React; 14 + 3 tests; a real TUI component and a browser EventSource client are not built) One value updates Web, Desktop and the TUI; recorded.

## Phase 6 - Optional layers (M6)

- [ ] T018 Owner decision: DOM renderer for small Blend apps, yes or no.
- [ ] T019 Owner decision: page/SSR layer for public pages (Vike unchanged), yes or no.

## Phase 7 - Detach (M7)

- [ ] T020 ACRYL plugins stop importing `ctx.webServer`; the remaining uses listed and justified; docs, tests and `docs/DEVELOPMENT-LOG.md` updated. Partly done: the Market no longer uses it (T009). Remaining on 2026-10-23, none touched: `apps/acryl-desktop/src/index.ts` (five renderer-facing routes: portable with the same recipe); `acryl-agent-control` through the `acrylWeb` carrier (HTTP routes plus a WebSocket upgrade, and security-sensitive MCP and tool gateways: port the HTTP routes only after a review, the upgrade stays on `webServer`); `acryl-sign-in`'s account callback (it provides a `webServer`-shaped object to DSH's account plugin, which is DSH's need, not ours); the two engine composition roots (the seam, they serve DSH itself). Also pending: the agent-facing docs and example for host routes in `acryl-plugin-context` still teach `webServer`; the development log entry is written (`docs/DEVELOPMENT-LOG.md`, 2026-10-23).

## Phase 8 - Port the IDE into the framework: moved

Phase 8 has its own spec, `specs/048-ide-on-framework/` (spec, plan with the slice method, measures and order, and tasks). T021-T027 moved
there: T021 is 048 T001 (done), T024 is 048 T002, T023 is 048 T003, T025 is 048 T004, T026 is 048 T006, T022 is 048 T008, T027 is 048 T009.

## Phase 9 - Drivers (not started)

The framework assumes no built-in agent. DSH becomes one driver among others, all acting through the door (`acryl-agent-control`).

- [x] T028 `acryl-driver-dsh`: the DeepSeek Harness chat (many LLM providers) as a driver plugin; the framework packages keep no DSH or harness import.
  Reshaped 2026-10-28 (coordinator): a generic ACP chat driver, `driver-acp` in acrylblends (`plugins/driver-acp`, beside `driver-pty`), with `dsh`
  (`dsh --profile acp`) as its first preset and other ACP agents by config, so DSH gets no code of its own. It speaks ACP v1 over stdio with no
  `@deepseek-ai/*` import and finds `dsh` on the PATH. Authored on acrylblends branch `075-driver-acp`; Blends reviews, merges and ships it.
  Done when it is on acrylblends main and the panel gate (`verify-agent-panel.mjs --driver acp:dsh`) passes against a real `dsh`.
  Met 2026-10-28 14:45 CET: acrylblends `main` `d81e1bb2` (`8967ee78` plus `4baf606b`, the review fix that ends the agent's whole process
  group; `761cfaa1` formats the fake agent), branch CI 8/8. The live run is above; 17 plugin tests include the ACP v1 schema conformance check and the tool-child disposal test.
- [x] T029 `acryl-driver-pty`: a PTY driver plugin that runs `claude`, `codex`, `pi` and others inside the app folder, acting through the door.
  Met in acrylblends as `driver-pty` (released 0.10.0): the M8 evidence run has `claude`, `codex` and `pi` each building a route through
  the door in its terminal in 19-31 s (`docs/plans/pty-driver-evidence.md` there); `scripts/verify-driver-pty.mjs` is its repeatable gate.
- [ ] T030 (low priority, after acrylblends 1.0) Decide how ACRYL's `acrAgentControl` (`runtime/acryl-control/src/agent/`, the door's workers with the
  `claude` provider, `dshNativeProvider` without a transport) relates to the framework's `drivers` registry (`acrylblends/drivers`). Both describe
  "an agent the app can run", with different contracts. One should become the other's adapter, or one should go; record the decision before either
  grows. Found while designing T028.
  Risk for that decision (2026-10-28, the 1.0 door check): ACRYL composes no acrylblends door plugin today - `acryl-agent-control` imports
  `acrylblends/door/host`, `/page` and `/protocol` and wires its own routes, and nothing here sets `NODE_ENV` - but a future `acrylblends/cordis/door`
  row would bring the door's `NODE_ENV=production` gate (`plugins/acryl-door/src/index.ts:94` there) into the packaged app and need
  `allowInProduction: true`.
