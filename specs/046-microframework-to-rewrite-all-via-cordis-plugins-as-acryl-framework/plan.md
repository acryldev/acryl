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
