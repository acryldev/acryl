# Acryl in a Cordis app

The ACRYL Framework puts its application model inside Cordis. You build an ordinary `Acryl`, register routes and middleware on it, then
mount that app from a Cordis plugin.

## The mental model

There are two layers:

1. **Application layer** - `Acryl`, handlers, middleware, context, requests, responses, validation and helpers. This is the ACRYL
   application API.
2. **Cordis layer** - plugins, services, injection, effects and disposal. This decides when an application exists and which surface can
   reach it.

A route therefore has two owners. The `Acryl` owns the route table. The plugin that mounted the app owns the mount for as long as its
Cordis fiber is active.

## A minimal plugin

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'todo'           // equals the package name and the Loader row id
export const inject = ['router']     // PENDING until a router exists

export function apply(ctx: Context): void {
  const app = new Acryl()
    .get('/', c => c.json({ ok: true }))
    .get('/todos/:id', c => c.json({ id: c.req.param('id') }))

  ctx.router.route('/todo', app)
  // Over HTTP only where the Host's adapter exists; the terminal UI and tests have no such service and skip this.
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
}
```

`ctx.router.route('/todo', app)` serves the app below `/todo`:

| Request | Answer |
| --- | --- |
| `GET /todo` | `{ "ok": true }` |
| `GET /todo/todos/42` | `{ "id": "42" }` |
| `GET /todo/` | 404: `/todo` and `/todo/` are different paths (see below) |

The app can come from `acryl-router` or from the published `acrylblends` package: `route` takes any app by its routes
(`MountableApp`), so an `Acryl` imported from `acrylblends` mounts as it is, with its middleware and its own `onError`.

### `/todo/` is a 404 until you choose

`/todo/` is the first thing people type, and by default it is not found: the router treats `/todo` and `/todo/` as two paths. Choose
one of these, in this order of preference:

- **Redirect in your app** (what `examples/acryl-todo` does): add `trimTrailingSlash()` from `acrylblends/trailing-slash` to the app.
  A GET or HEAD that would be a 404 and ends in `/` gets a 301 to the same path without it, so `/todo/` reaches the page and every
  route keeps one canonical path. Other methods are not redirected: `POST /todo/api/` stays a 404.

  ```ts
  import { trimTrailingSlash } from 'acrylblends/trailing-slash'

  const app = new Acryl()
    .use(trimTrailingSlash())
    .get('/', c => c.json({ ok: true }))
  ```

- **One path everywhere**: the `acryl-router` row's config `trailingSlash: 'ignore'` makes `/a` and `/a/` the same path for every
  mounted app, with no redirect. It is the app's composition that sets it (the Blueprint or profile that owns the router row), not one
  plugin, because it changes every other plugin's routes too.

`new Acryl({ strict: false })` does not help once the app is mounted: the router composes every mount into its own root app, and only the
router's `trailingSlash` setting decides. `strict: false` applies to an `Acryl` you serve yourself (`app.fetch`, `app.request`). Details
and a measured table: [Routing and mounting](../api/routing.md#trailing-slashes).

The mount belongs to the plugin that made it: `route` registers it as a Cordis effect of the caller, so when the plugin unloads the
routes disappear, and a reload mounts the app again without duplicating routes. `route` also returns a function that removes the mount
sooner.

Finish building the app before you mount it: the router copies the app's routes at the `route` call, as the core's own `app.route` does.

## Add middleware

Middleware is registered on the app before the routes it should wrap:

```ts
const app = new Acryl()
  .use(async (c, next) => {
    const started = Date.now()
    await next()
    c.header('X-Response-Time', String(Date.now() - started))
  })
  .get('/', c => c.json({ ok: true }))
```

Use middleware for authentication, logging, CORS, compression, request IDs and other behavior that should wrap more than one handler.
The built-in set is listed in [Middleware](../concepts/middleware.md).

## Render pages with JSX

A plugin renders HTML with the same JSX as the published package: set `"jsx": "react-jsx"` and `"jsxImportSource": "acryl-router/jsx"`
in its `tsconfig.json` (a `.tsx` file), and style with the CSS helper from `acryl-router/helpers`. Streaming with `Suspense` is in
`acryl-router/jsx/streaming`. The [JSX guide](../guides/jsx.md) covers the rest; its examples import from `acrylblends/jsx` instead.

## Run the same app on a surface

The application does not open a socket. A surface supplies requests to it:

- **Web** and **Desktop**: the Host's web server, through `acryl-router-http` (`routerHttp.mount(prefix)`).
- **Terminal UI**: in process, `await ctx.router.request('/todo/todos/42')`.
- **Tests**: `await ctx.router.request(...)` through the plugin, or `await app.request(...)` on the app alone.
- **A standalone process**: `acryl-node-server`, see [Node server](./node-server.md).

## Mount it in a Blend

Add a row to the Blend's `cordis.patch.yml`; the row id is the package name:

```yaml
- insert:
    - id: todo
      name: todo
```

A Blank app already carries the router, the HTTP adapter, state and the inspector. The reference app is `examples/acryl-todo`; the
smallest one to copy is `examples/acryl-framework-starter`.

## Test it without a socket

```ts
import { Context } from '@deepseek-ai/cordis'
import * as router from 'acrylblends/cordis/router'
import * as todo from '../src/index.ts'

const ctx = new Context()
ctx.plugin(router)
ctx.plugin(todo)
await new Promise(resolve => setTimeout(resolve, 0))   // let both plugins activate
const response = await ctx.router.request('/todo/todos/42')
expect(await response.json()).toEqual({ id: '42' })
```

## Package map

The framework plugins are published as subpaths of the `acrylblends` package (the Cordis forms); an app made by `acrylblends init` carries their source under `plugins/` instead, with the same names.

| Plugin | Published as | Responsibility |
| --- | --- | --- |
| `acryl-router` | `acrylblends/cordis/router` | the application API and the Cordis `router` service |
| `acryl-router-http` | `acrylblends/cordis/router-http` | serving router prefixes on the ACRYL Host's web server, with WebSocket upgrades owned by the mounting plugin |
| `acryl-node-server` | `acrylblends/cordis/node-server` | serving the whole router from a standalone Node.js process |
| `acryl-state` | `acrylblends/cordis/state` | shared application state across surfaces |
| `acryl-inspect` | `acrylblends/cordis/inspect` | runtime inspection of mounts, routes and plugins |
| `acryl-db`, `acryl-db-sqlite` | `acrylblends/cordis/db`, `acrylblends/cordis/db-sqlite` | the `db` port and its SQLite provider |
| `acryl-kv`, `acryl-kv-json`, `acryl-kv-db` | `acrylblends/cordis/kv`, `.../kv-json`, `.../kv-db` | the `kv` port and its providers |
| `acryl-door` | `acrylblends/cordis/door` (experimental) | the door: an agent looks at the running app and acts on it, in development only |

## Next

- [Core concepts](./concepts.md)
- [Routing and mounting](../api/routing.md)
- [Context](../api/context.md)
- [Plugin lifecycle and disposal](./plugin-lifecycle.md)
