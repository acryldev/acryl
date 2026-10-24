# Getting started

The ACRYL Framework puts its application model inside Cordis. You build an ordinary `App`, register routes and middleware on it, then
mount that app from a Cordis plugin.

## The mental model

There are two layers:

1. **Application layer** - `App`, handlers, middleware, context, requests, responses, validation and helpers. This is the ACRYL
   application API.
2. **Cordis layer** - plugins, services, injection, effects and disposal. This decides when an application exists and which surface can
   reach it.

A route therefore has two owners. The `App` owns the route table. The plugin that mounted the app owns the mount for as long as its
Cordis fiber is active.

## A minimal plugin

```ts
import type { Context } from '@deepseek-ai/cordis'
import { App } from 'acryl-router'

export const name = 'todo'           // equals the package name and the Loader row id
export const inject = ['router']     // PENDING until a router exists

export function apply(ctx: Context): void {
  const app = new App()
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
| `GET /todo/` | 404: `/todo` and `/todo/` are different paths unless the router is configured with `trailingSlash: 'ignore'` |

The mount belongs to the plugin that made it: `route` registers it as a Cordis effect of the caller, so when the plugin unloads the
routes disappear, and a reload mounts the app again without duplicating routes. `route` also returns a function that removes the mount
sooner.

Finish building the app before you mount it: the router copies the app's routes at the `route` call, as the core's own `app.route` does.

## Add middleware

Middleware is registered on the app before the routes it should wrap:

```ts
const app = new App()
  .use(async (c, next) => {
    const started = Date.now()
    await next()
    c.header('X-Response-Time', String(Date.now() - started))
  })
  .get('/', c => c.json({ ok: true }))
```

Use middleware for authentication, logging, CORS, compression, request IDs and other behavior that should wrap more than one handler.
The built-in set is listed in [Middleware](./middleware.md).

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
import * as router from 'acryl-router'
import * as todo from '../src/index.ts'

const ctx = new Context()
ctx.plugin(router)
ctx.plugin(todo)
await new Promise(resolve => setTimeout(resolve, 0))   // let both plugins activate
const response = await ctx.router.request('/todo/todos/42')
expect(await response.json()).toEqual({ id: '42' })
```

## Package map

| Package | Responsibility |
| --- | --- |
| `acryl-router` | the application API and the Cordis `router` service |
| `acryl-router-http` | serving router prefixes on the ACRYL Host's web server |
| `acryl-node-server` | serving the whole router from a standalone Node.js process |
| `acryl-state` | shared application state across surfaces |
| `acryl-inspect` | runtime inspection of mounts, routes and plugins |

## Next

- [Core concepts](./concepts.md)
- [Routing and mounting](./routing.md)
- [Context](./context.md)
- [Plugin lifecycle and disposal](./plugin-lifecycle.md)
