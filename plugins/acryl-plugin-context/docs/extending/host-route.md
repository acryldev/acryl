# Host routes: an HTTP API for a web/desktop plugin

Example: `../example-plugins/packages/host-route-basic/`. Build your routes as one app and serve it on the framework's router:

```js
import { Acryl } from 'acrylblends'
export const inject = ['router', 'routerHttp']
export function apply(ctx) {
  const app = new Acryl()
  app.get('/api/my-plugin/hello', c => c.text('ok'))
  ctx.router.route('/', app)          // the routes, owned by this plugin
  ctx.routerHttp.mount('/api/my-plugin') // the one prefix the web server hands to the router
}
```

- One prefix per plugin, `/api/<plugin>`, and every route under it. Two plugins cannot mount the same prefix.
- No `ctx.effect` and no disposer: the routes and the mount belong to the plugin and leave when it unloads (a request still running is
  ended within a short grace).
- `package.json`: `acrylblends` under `peerDependencies` (the app provides it; under `dependencies` the install is refused), and
  `"dsh": { "requiresAcrylPackages": ["acrylblends/cordis/router", "acrylblends/cordis/router-http"] }` so an installed plugin resolves the
  app's own copy.
- The router comes from the app's `framework-kit` row (every built-in Blueprint has it). Without it the plugin is PENDING, not failed.
- Web and desktop only (tui has no web server). A client bundle can `fetch` the route to share state with the host and with other devices.
- The handler gets a context `c`: `c.req.json()`, `c.req.query('x')`, `c.req.header('origin')`, and answers with `c.json(value, status)`,
  `c.text(...)` or `c.body(...)`. Validate every input; the route is reachable by the page and by any program on the machine unless you
  check the caller.

To persist data behind a route, prefer exact RPC routes under `/api` (`connection.fetch.register`, answered in the RPC envelope) over a plain route,
and read `state-and-persistence.md` first: it lists every place a plugin can keep state and the mistakes that break an RPC route (result envelope,
rpcId, payload); those routes sit behind the app's browser authentication. `connection.rpc.handle` works in ACRYL only (stock DSH's connection row
lacks `webServer`). Example: `../example-plugins/packages/state-host-store/`.
