# Plan 046 - ACRYL Framework

See `spec.md` for the milestones and gates. Per-milestone Cordis mini-designs go below as each milestone starts.

## Principles

- Smallest working step first; each step leaves everything working. No step needs a flag day.
- Prove with a real Loader, never only with mocks (activation, PENDING and reactivation, provider replacement, disposal,
  repeated mount and reload, leak check).
- Wrap before replacing: the router wraps DSH `webServer` before anything is removed.
- Work on a branch in its own worktree while the main checkout carries uncommitted work.

## Cordis mini-design, M1-M2 (router)

The full six-point design is in `docs/acryl/ROUTER-SERVICE-DESIGN.md` and is the plan of record for M1 and M2:
plugins `acryl-router` (provides `router`) and `acryl-router-http` (injects `router`, `webServer`); row ids equal package
names; no events and no durable state; verification list as in M0.

## M0 conformance suite, outline

One test file driven by a small factory `makeRouter(): Router`, so a candidate is a one-function adapter:

- registers and matches exact, prefix, and parameter routes; duplicate (method, path) throws;
- middleware order and `next()`;
- same handler, same `Response`, via `router.fetch` and via the HTTP adapter;
- dispose removes the route (404) and leaves other plugins' routes;
- 50 mount/unload cycles return the table to its baseline size;
- in-flight request abort on adapter disposal;
- real Loader: late `router` provider leaves consumers PENDING, then they activate; swapping the provider reloads consumers
  with no duplicate registrations.

## Mini-designs still to write (before each milestone starts)

M3 surfaces, M4 plugin contract, M5 state service, M7 detach. Each needs the six points from `AGENTS.md`.

## Decisions (2026-10-23)

- **typert and the router (open question 1).** typert stays what it is: generated RPC over a WebSocket upgrade on the API
  gateway. The router does not wrap it and an RPC method is not also a router route. Reason: the TUI runs the engine in
  process (`startDirectHost()`) and calls Host services directly, so the one consumer that has no WebSocket does not need
  one; adding a second way to reach the same method would add surface without a user.
- **Desktop transport (open question 2).** ACRYL Desktop serves its renderer from its own loopback `webServer` row, so the
  router reaches Desktop through the same adapter as Web. No IPC bridge is involved for router routes.
- **Optional HTTP.** A capability's routes are registered in `apply` against `router`; serving them over HTTP is a separate,
  optional step (`ctx.inject(['routerHttp'], c => c.routerHttp.mount(prefix))`). That is what lets one plugin run on a
  terminal composition with no server (proved in `acryl-router-http/tests/surfaces.spec.ts`).
- **The plugin contract is derived, not declared (M4).** Cordis already exposes a plugin's name, state, `inject` (what it
  requires) and labeled effects (`ctx.provide("x")` for what it provides, `<plugin>: GET /a` for what it registers). A second
  hand-written declaration would drift from the code. M4 therefore adds a label convention and an inspector that reads the
  running system; the static `acryl.requires` and `acryl.provides` in `package.json` stay for catalogs that read a package
  before loading it.
