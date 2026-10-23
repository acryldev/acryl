# Router service: one handler, three surfaces (design draft)

Status: draft for review, nothing implemented. Written 2026-10-23.

## Why

ACRYL runs on three surfaces: Web (browser), Desktop (Electron) and the terminal UI. Today an HTTP-style capability
(list plugins, install, sign-in, market) can only be reached through the DeepSeek Harness `webServer`, which speaks
`node:http`. The TUI has no web server, so it re-implements each capability on its own. This page designs one
`router` service that lets a plugin write a handler once and have all three surfaces call it.

It also removes one coupling to the DSH Host: plugins would depend on the `router` service, not on `ctx.webServer`.

## Facts measured (2026-10-23, from the pinned checkout)

| Fact | Evidence |
| --- | --- |
| `webServer` is a Cordis `Service` holding exact, prefix and upgrade route tables plus one fallback seat. `register(route)` returns a disposer. | `deepseek-harness/packages/host/webserver/src/index.ts` (365 lines) |
| Handlers are `(req: IncomingMessage, res: ServerResponse)` and own the whole response. There is no middleware chain and no Web-standard `Request`/`Response`. | same file, `WebRoute.handler` |
| Matching is fixed: exact over the whole table, then longest prefix, then the fallback. A duplicate path throws. | webserver README, "Registering routes" |
| The webserver "serves browsers only; Electron loads dist over `file://` and carries fetch over an IPC bridge." | webserver README, summary |
| Typed RPC is a separate system: typert (`@Remote` decorators, generated descriptors) exposed by the API gateway through `registerUpgrade` (WebSocket). | `packages/typert/*`, `packages/api/gateway/src/index.ts:262` |
| ACRYL HTTP routes today: the market plugin (`registerMarketRoutes`) and sign-in callbacks, all through `ctx.webServer`. | `plugins/cordis-plugin-market/src/host/routes.ts`, `plugins/acryl-sign-in/src/account-callback.ts` |
| ACRYL has no Reference A, Express, Fastify or Koa dependency. | grep of every `package.json` |

## The shape (what to copy from Reference A)

Reference A's useful idea is small: a `Context`, a middleware chain with `next()`, and a router behind one interface, all on
Web-standard `Request`/`Response`. We take that shape, not the 4.9k lines of source or the built-in middleware.

```ts
// provided by the plugin `acryl-router`
interface Router {
  /** Register a route. Returns a disposer. A duplicate (method, path) throws, like webServer. */
  route(method: Method | '*', path: string, handler: Handler): () => void
  /** Register middleware for a path prefix. Returns a disposer. */
  use(path: string, middleware: Middleware): () => void
  /** Run a request in process. The only entry point every surface needs. */
  fetch(request: Request): Promise<Response>
}
type Handler = (c: RouteContext) => Response | Promise<Response>
type Middleware = (c: RouteContext, next: () => Promise<Response>) => Promise<Response>
```

`fetch` is the key. Web calls it behind HTTP, Desktop calls it from the IPC bridge, the TUI calls it directly.

## Cordis mini-design (repo protocol, six points)

### 1. Capability and plugin boundary

The domain is "request routing for plugin-owned capabilities". It needs its own lifecycle because routes must appear
and disappear as plugins load and unload, and it must be replaceable (a faster matcher later) without touching the
plugins that register routes. Two plugins:

- `acryl-router`: the `router` service (tables, middleware chain, `fetch`). No I/O.
- `acryl-router-http`: the Web adapter. Consumes `webServer` and `router`, registers one prefix route per mount on
  `webServer`, converts `IncomingMessage` to `Request` and `Response` to `ServerResponse`.

Loader row ids equal the package names (repo rule). Neither is a shared multi-provider slot.

### 2. Provides and consumes

| Plugin | Provides | Hard `inject` | Optional `ctx.get()` |
| --- | --- | --- | --- |
| `acryl-router` | `router` | none | none |
| `acryl-router-http` | none | `router`, `webServer` | none |

Desktop and TUI need no adapter plugin: they call `router.fetch` directly. A consumer plugin (for example the market)
injects `router`. While no `router` exists the consumer is PENDING, which is the valid missing-dependency state.

### 3. Effects and disposal

- Every `route` and `use` registration is acquired inside the registering plugin's `ctx.effect()` and released by the
  returned disposer, so a route vanishes when its owning Fiber unloads.
- `acryl-router-http` holds one effect per mount on `webServer.register`. On dispose it removes that route first, then
  aborts in-flight requests through an `AbortController` per request (`exec.signal`-style quiescence), then returns.
- Required order on provider change: the adapter disposes before `router` does, so no request reaches a dead table.
- No timers, sockets or subprocesses live in `acryl-router`.

### 4. Configuration and composition

- `acryl-router`: no config except an optional `trailingSlash: 'strict' | 'ignore'` (default `strict`), validated by a
  runtime schema.
- `acryl-router-http`: `mount: string` (default `/`), loopback only unless `webServer` is exposed (it carries no auth
  itself, as the webserver README states).
- Stable row ids: `acryl-router`, `acryl-router-http`. Provider replacement: swapping `acryl-router` reloads every
  consumer, which re-registers its routes.

### 5. Events and durability

No events and no durable state. Routes are runtime registrations, rebuilt on every start. The middleware chain is a
plain in-service composition (`next()` as a function argument), not a Cordis waterfall event.

### 6. Verification

Run against a real Loader, not mocks:

- activation order and PENDING then reactivation when `router` loads late;
- provider replacement (swap `acryl-router`, consumers re-register, no duplicates);
- disposal (unload a consumer: its route returns 404; no leaked tables);
- repeated mount and reload (50 cycles, table size returns to baseline);
- in-flight request abort on adapter disposal;
- the same handler returning the same `Response` via HTTP, via `router.fetch`, and via the Electron IPC bridge.

## Rewrite or depend on Reference A

| | Rewrite (about 300 lines: matcher, `compose`, context) | Depend on `reference-a` behind the service |
| --- | --- | --- |
| Size a person can hold in their head | yes | the dependency is small, but the surface we use is a subset |
| Cordis fit (dispose, PENDING) | native | needs an adapter either way |
| Parameters, wildcards, performance | we write and test them | free |

Proposal: rewrite the core and use Reference A's own test cases as the reference suite, keeping `reference-a` as a documented
fallback if parameter matching grows past what the market and sign-in routes need. This decision is open.

## Open questions

1. **typert.** It is RPC over a WebSocket upgrade, not HTTP routes. The router sits beside it. Should an RPC method also
   be reachable through the router, so the TUI can call it without the WebSocket? Not decided.
2. **Electron IPC bridge.** The webserver README says Desktop carries fetch over IPC. Where that bridge lives (the DSH
   desktop host or ACRYL) and whether it can call `router.fetch` is unverified.
3. **Migration.** First wrap `webServer`, then port the market routes as the proof. Existing `ctx.webServer` users keep
   working unchanged in between.
4. **Name.** Check that `router` does not collide with an existing Cordis or DSH service name before implementing.

## Next steps

1. Review this page.
2. Prototype `acryl-router` with the six verification checks above.
3. Port the market routes. If that works, add `acryl-router-http` to the Web composition.
4. Decide `state` (the DOM-free reactive core shared by the surfaces) and the optional DOM renderer in a second page.

## Decision record: Reference A or Vike as the base (2026-10-23)

Input: the research file `ACRYL Microframework Recommendation` (an outside assistant's market survey; its claims about
third-party releases are not verified here). Measured here, by shallow clone of each repository:

| | Reference A | Vike |
| --- | --- | --- |
| Layer | HTTP transport: router, middleware, Request/Response | page rendering: file-based routing, SSR, prerender, a Vite plugin |
| Core source | about 3.4k lines in the files that matter (`compose` 73, `router` 103, linear router 152, `hono-base` 564, `context` 797, `request` 520) | about 45.9k lines in `packages/vike/src` |
| Runtime dependencies | none | 20+ (`vite` >= 7.1, `rolldown`, `@babel/core`, `@universal-middleware/*`, `sirv`, and more) |
| Can a person hold it in their head | yes | no |

They are not alternatives: Vike runs on a server, and its own templates use Reference A as that server. Choosing Reference A now keeps
Vike available later.

Decision:

1. The base we rewrite as Cordis plugins is **Reference A's design**, not Vike. A rewrite of about 1k lines covers the part
   ACRYL needs (route registry, middleware `compose`, a reduced `Context`, a linear then trie matcher).
2. **Vike is not rewritten.** ACRYL's UI is a slot-based app, not a set of pages, and it is not SEO-sensitive. If ACRYL
   later needs server-rendered public pages, depend on Vike unchanged behind a plugin (it needs Vite anyway) and serve it
   through the `router`.
3. React, Vite, typert and `pi-tui` stay as they are.
