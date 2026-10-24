# Migration from the DSH webServer

ACRYL plugins have registered HTTP routes directly with the DSH `webServer` (or the Host's `acrylWeb` wrapper of it): one Node-style handler
per exact path or prefix, with no middleware chain. The framework replaces that with an `App`, a mount, and Web-standard requests.

## Before and after

Before, a plugin claims a path and writes the Node response itself:

```ts
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.acrylWeb.register({
    kind: 'exact',
    path: '/api/health',
    handler: (req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    },
  }))
}
```

After, it builds an app, mounts it, and asks the Host adapter to serve the prefix:

```ts
import { App } from 'acryl-router'

export const inject = ['router']

export function apply(ctx: Context): void {
  const app = new App().get('/health', c => c.json({ ok: true }))
  ctx.router.route('/api', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/health') })
}
```

`routerHttp.mount(prefix)` claims the prefix on the same web server, so the public path does not change. The terminal UI and tests reach
the route in process (`ctx.router.request('/api/health')`), which the old handler never allowed.

## What maps to what

| webServer | Framework |
| --- | --- |
| `register({ kind: 'exact', path, handler })` | a route on an `App`, mounted with `ctx.router.route`; served with `routerHttp.mount(path)` |
| `register({ kind: 'prefix', path, handler })` | an `App` mounted at `path` with its own routes below it |
| `req.method` checks in the handler | `app.get`, `app.post`, ... (add `methodNotAllowed` for 405 answers) |
| `new URL(req.url, ...)` and manual parsing | `c.req.param`, `c.req.query`, `c.req.header` |
| reading the body stream by hand | `c.req.json()`, `c.req.parseBody()` behind `bodyLimit`, or a validator |
| `res.statusCode`, `res.setHeader`, `res.end` | `c.json`, `c.text`, `c.body`, `c.header`, or a returned `Response` |
| `req.socket.remoteAddress` | `connectionOf(c)` / `getConnInfo(c)` |
| a peer or origin check copied into each handler | `loopbackOnly`, `cors`, `csrf` or a middleware of your own |
| the disposer returned by `register` | nothing: `route` and `mount` belong to the calling plugin |

## Migration steps

Move one capability at a time:

1. Build an `App` for the capability and move its handlers into it without changing their public answers.
2. Mount it with `ctx.router.route` and serve the same prefix with `routerHttp.mount`.
3. Remove the direct `webServer` registration in the same change: the two cannot claim one prefix, `mount` throws.
4. Test the route through the router (`ctx.router.request`) and over the Host, and unload and reload the plugin to confirm the route goes
   away and comes back once.

Keep domain calls unchanged until the transport change is green; do not rewrite transport, handlers and authorization in one step.

## A worked example: the workspace

`acryl-workspace` (files, git, terminals, projects, agents) was the largest user of the webServer: 24 exact routes. It now builds one app
per domain folder (`filesRoutes`, `gitRoutes`, `ptyRoutes`, ...), composes them once (`privateApi` in `src/private-route.ts`), mounts the
result after the effect that builds its services, and serves the one prefix `/api/acryl-workspace`:

```ts
const built: { api?: App } = {}
ctx.effect(() => {
  // ... the PTY table, git, files, the project registry ...
  built.api = privateApi(filesRoutes(files, report), gitRoutes(git, report) /* , ... */)
  return async () => { /* release them */ }
})
ctx.router.route('/', built.api)
ctx.routerHttp.mount('/api/acryl-workspace')
```

Mounting after the effect orders the unload: the mount goes first, so the requests and event streams its code is serving end and are
waited for, then the services are released. Each route names its guard (`loopbackOnly({ callers: 'own-page' })` for the page, a bearer token
for the agent hooks) and its body limit; the event stream is `streamSSE`, and its keep-alive is one timer the plugin owns, not one per
request. The terminal's WebSocket stays a webServer upgrade until the router carries upgrades (spec 047 T009).

The answers that changed are recorded with it: a body over a route's limit is 413 on every route (some said 400); a wrong method is 405 with
an `Allow` header on every route; a missing or wrong agent-hook token is 401 with `WWW-Authenticate` (it was 403); and the hook's `Host`
must be the app's own loopback address. Its routes refuse an in-process call on purpose (the guard needs a socket to check), so its tests
run over loopback through the same adapter (`tests/serve-api.ts`), which is the "test over the Host" below.

## Completion check

A capability is migrated when:

- no handler in it touches Node `req` / `res` objects or the old server types;
- its public paths and answers are unchanged, or the changes are recorded;
- it unloads and reloads without duplicate or missing routes;
- the same handler passes an in-process test and a test over the Host.

Typed RPC stays a separate concern. Do not convert RPC methods because their names look like HTTP routes.
