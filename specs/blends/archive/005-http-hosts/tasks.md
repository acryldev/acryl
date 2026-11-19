# Tasks: HTTP contract and hosts

- [x] T501 Package scaffolds (`http`, `hono`, `fastify`), dependencies installed
- [x] T502 `@aimbrace/http`: types, router, response helpers, tokens
- [x] T503 dispatcher with request scopes, middleware, error mapping, body lifetime
- [x] T504 `http` plugin, `route()` and `routesPlugin()`
- [x] T505 router and dispatcher unit tests (no network)
- [x] T506 `@aimbrace/hono` host
- [x] T507 `@aimbrace/fastify` host
- [x] T508 shared contract suite, passing under both hosts
- [x] T509 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- `ctx.report(error, where)` was added to core (`BaseContext`) because the HTTP plugin had no clean way to reach the app error reporter.
- Mutation check of the contract suite: making the request scope never dispose fails 3 tests under Hono; disabling Fastify's explicit abort wiring is not detected because disconnects also propagate through the response stream (client disconnect -> Node stream destroyed -> web stream cancelled -> scope disposed). The suite pins the observable contract, not the mechanism.
- Hosts keep per-activation state in a `WeakMap` keyed by the plugin context, because one plugin object can be installed in several apps and `start` has no access to `setup` closures.
- The type system correctly refused `ctx.get(HonoApp)` inside `start` (a provided service is not a requirement); the Hono instance travels in the per-activation state instead.
