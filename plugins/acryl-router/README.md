# acryl-router

The ACRYL router: one Cordis service, `ctx.router`, that lets a plugin register routes and middleware once and have
every surface call them. Part of the ACRYL Framework (spec 046, `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/`).

## What it gives you

```ts
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.use('/api', async (c, next) => { c.set('started', Date.now()); return next() })
  ctx.router.get('/api/market/:id', c => c.json({ id: c.params['id'] }))
  ctx.router.post('/api/market', async c => c.json(await c.req.json(), 201))
}
```

- **Web-standard types.** Handlers take a small `RouteContext` and return a `Response`. Nothing in the handler knows
  whether the caller is a browser, the Electron bridge or the terminal UI.
- **In-process `fetch`.** `ctx.router.fetch(new Request('http://acryl.test/api/market/1'))` runs the same handler with no
  socket. Web serves it behind HTTP through `acryl-router-http`; Desktop and the TUI call `fetch` directly.
- **Every registration is reversible.** A route registered from a plugin's context is removed when that plugin unloads.
  The `route`, `get`, `post`, `put`, `patch`, `delete` and `use` calls also return a remover.
- **Cancellation.** `c.signal` is aborted when the caller aborts or when the router is disposed; disposal waits for
  in-flight requests to settle. A disposed router answers 503.

## One plugin on every surface

Register routes in `apply`; ask for HTTP only if an adapter is there. The same plugin then runs behind HTTP on Web and
Desktop and, on a terminal composition with no server, answers `router.fetch` in process:

```ts
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.get('/api/notes/:id', c => c.json({ id: c.params['id'] }))
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/notes') })   // only where HTTP exists
}
```

A request's peer address is `c.connection.remoteAddress`, set by the adapter from the socket; an in-process call has none, so a
handler that must trust the peer (the Market does) refuses it.

## Matching rules

| Rule | Behavior |
| --- | --- |
| Specificity | static segment, then `:param`, then `*`, compared left to right, regardless of registration order |
| Method | a route for the exact method beats an any-method (`*`) route; a known path with another method answers 405 and `Allow` |
| Duplicates | the same method and shape (parameter names ignored) throws at registration |
| Wildcard | `*` is allowed only as the last segment and matches zero or more segments (`c.params['*']`) |
| Trailing slash | `strict` (default) keeps `/a` and `/a/` distinct; `ignore` joins them |
| Middleware | `use('/api', mw)` covers `/api` and everything below, runs in registration order, `next()` once |
| Errors | a throwing handler answers 500 and is logged; an aborted request answers 499 |

## More

Groups (`router.group('/x', ...mw)`), `onError`/`notFound`, `request(path)` for tests, built-in middleware (`acryl-router/middleware`) and helpers
(`acryl-router/helpers`) are documented in `docs/framework/`.

## Layout

- `src/table.ts`: the pure routing core (no Cordis).
- `src/service.ts`: the `Router` service, effects and disposal.
- `tests/conformance.ts`: the framework-neutral suite any router candidate must pass (spec 046, M0).

Row id and package name: `acryl-router`.
