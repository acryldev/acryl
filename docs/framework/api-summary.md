# API summary

One page with the calls an ordinary app uses, each linked to the page that explains it. Imports are from `acryl-router` unless noted.

## A plugin that serves an app

```ts
import type { Context } from '@deepseek-ai/cordis'
import { App } from 'acryl-router'
import { trimTrailingSlash } from 'acryl-router/middleware'
import { schemaValidator, streamSSE, type StandardSchema } from 'acryl-router/helpers'
import type {} from 'acryl-state'

export const name = 'orders'                 // the package name and the Loader row id
export const inject = ['router', 'state']    // the plugin waits (PENDING) until both exist

interface Order { id: string, item: string }
const NewOrder: StandardSchema<{ item: string }> = {
  '~standard': {
    validate: value => {
      const item = (value as { item?: unknown } | null)?.item
      return typeof item === 'string' && item !== '' ? { value: { item } } : { issues: [{ message: 'item is required', path: ['item'] }] }
    },
  },
}

export function apply(ctx: Context): void {
  const orders = ctx.state.cell<Order[]>('orders.list', [])
  const app = new App()
    .use(trimTrailingSlash())
    .get('/', c => c.json(orders.get()))
    .post('/', schemaValidator('json', NewOrder), c => {
      const order = { id: crypto.randomUUID(), ...c.req.valid('json') }
      orders.update(list => [...list, order])
      return c.json(order, 201)
    })
    .get('/events', c => streamSSE(c, async stream => {
      const ended = new Promise<void>(resolve => { stream.onAbort(resolve) })
      const stop = orders.subscribe(list => { void stream.writeSSE({ data: JSON.stringify(list) }) })
      await stream.writeSSE({ data: JSON.stringify(orders.get()) })
      try { await ended } finally { stop() }
    }))
  ctx.router.route('/orders', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/orders') })
}
```

## `App` ([Routing](./routing.md))

| Call | Does |
| --- | --- |
| `new App()` | an application: a route table plus middleware |
| `.get / .post / .put / .patch / .delete / .options (path, ...handlers)` | a route; handlers before the last are middleware for that route |
| `.all(path, ...)`, `.on(methods, path, ...)` | any method, or a list of methods |
| `.use([path], ...middleware)` | middleware for every route below `path` (all routes without it), registered before the routes it wraps |
| `.route(path, otherApp)` | copy another app's routes below `path` |
| `.basePath(path)` | the same app with a prefix on every route registered through it |
| `.onError((err, c) => ...)`, `.notFound(c => ...)` | the app's error and not-found answers |
| `.request(pathOrRequest, init?)` | call the app in process (tests) |
| `.fetch(request)` | the app as a fetch handler |

Paths: `/posts/:id` (parameter), `/posts/:id?` (optional), `/files/*` (wildcard), `/:name{[a-z]+}` (pattern). `/a` and `/a/` are different
paths: see [Trailing slashes](./routing.md#trailing-slashes).

## The handler context `c` ([Context](./context.md))

| Call | Does |
| --- | --- |
| `c.json(value, status?, headers?)` | a JSON answer |
| `c.text(text, status?)`, `c.html(html, status?)` | a text or HTML answer |
| `c.body(data, status?, headers?)` | a raw answer (`c.body(null, 204)`) |
| `c.redirect(location, status = 302)` | a redirect |
| `c.notFound()` | the app's not-found answer |
| `c.header(name, value)`, `c.status(code)` | set a header or the status (also after `await next()` in middleware) |
| `c.set(key, value)`, `c.get(key)`, `c.var.key` | values for this request only, passed from middleware to handlers |
| `c.req.raw.signal` | aborts when the caller leaves, the serving plugin unloads, or the router is disposed |
| `c.executionCtx.waitUntil(promise)` | keep the request in flight until background work settles |
| `connectionOf(c)` / `getConnInfo(c)` | the caller's address and the local port, when a transport supplied them |
| `throw new HTTPException(status, { message })` | stop with that status from anywhere in the chain |

## The request `c.req` ([Request](./request.md))

| Call | Gives |
| --- | --- |
| `c.req.param('id')`, `c.req.param()` | route parameters |
| `c.req.query('page')`, `c.req.query()`, `c.req.queries('tag')` | query string values (`queries` for repeated keys) |
| `c.req.header('x-name')`, `c.req.header()` | request headers |
| `await c.req.json()`, `c.req.text()`, `c.req.formData()`, `c.req.parseBody()`, `c.req.arrayBuffer()`, `c.req.blob()` | the body, once |
| `c.req.valid(target)` | the value a validator checked, typed by its schema |
| `c.req.method`, `c.req.path`, `c.req.url`, `c.req.raw` | the method, path, full URL and the Web `Request` |

## Validation ([Validation](./validation.md))

```ts
import { schemaValidator, validator } from 'acryl-router/helpers'
app.post('/', schemaValidator('json', Schema), c => c.json(c.req.valid('json')))
```

- Targets: `json`, `form`, `query`, `param`, `header`, `cookie`. `Schema` is any Standard Schema (Schemastery, Zod, Valibot, or an
  object with `'~standard': { validate }`).
- A failure is 400 `{ error: 'invalid <target>', issues: [{ message, path }] }`; `path` is dotted, and `""` when the issue has none.
- The `json` target reads the body only with a JSON `Content-Type`; otherwise the schema sees `{}`.
- `validator(target, (value, c) => valueOrResponse)` is the same middleware with a function instead of a schema.
- Put `bodyLimit({ maxSize })` from `acryl-router/middleware` in front on routes open to untrusted callers.

## Streaming ([Helpers](./helpers.md))

| Call | Does |
| --- | --- |
| `streamSSE(c, async stream => { ... })` | a server-sent event answer |
| `stream.writeSSE({ data, event?, id?, retry? })` | send one event (`data` is a string) |
| `stream.write(text)`, `stream.writeln(text)` | raw bytes or a line (a comment line such as `: keep-alive\n\n` keeps a proxy from closing the stream) |
| `stream.onAbort(fn)`, `stream.aborted` | the client left or the plugin unloaded: stop work and release subscriptions |
| `stream(c, ...)`, `streamText(c, ...)` | a byte stream or a text stream instead of events |

Do not start timers inside a handler for keep-alives; let the plugin own one timer and write to the open streams.

## Cordis services

| Call | Service | Does |
| --- | --- | --- |
| `ctx.router.route(path, app)` | `router` (`acryl-router`) | serve `app` below `path` for as long as the calling plugin is loaded; returns a function that removes it sooner |
| `ctx.router.request(path, init?)`, `ctx.router.fetch(request)` | `router` | call the mounted routes in process (terminal UI, tests, other plugins) |
| `ctx.router.onError(handler)`, `ctx.router.notFound(handler)` | `router` | router-wide error and not-found answers, owned by the caller |
| `ctx.routerHttp.mount(prefix)` | `routerHttp` (`acryl-router-http`) | inside the ACRYL Host: serve a router prefix on the Host's web server (Web and Desktop). Use it through `ctx.inject(['routerHttp'], ...)` so the app also runs where there is no Host |
| `ctx.nodeServer.url`, `ctx.nodeServer.port` | `nodeServer` (`acryl-node-server`) | without the Host: one Node server for the whole router; options `hostname` (`127.0.0.1`), `port` (`0`), `scan` (`20`). See [Node server](./node-server.md) |
| `ctx.state.cell(key, initial)` | `state` (`acryl-state`) | a writable cell owned by the plugin: `get()`, `set(value)`, `update(fn)`, `subscribe(fn)` returning an unsubscribe |
| `ctx.state.derive(key, [cells], fn)` | `state` | a read-only cell computed from others |
| `GET /api/state/:key`, `GET /api/state/:key/events` | `state` | each cell over the router, read-only; `useCell(cell)` from `acryl-state/react` in a React page |

Everything a plugin registers this way (mounts, cells, handlers) goes away when the plugin unloads, and comes back once when it reloads:
see [Plugin lifecycle and disposal](./plugin-lifecycle.md).

## Middleware ([Middleware](./middleware.md))

From `acryl-router/middleware`: `bodyLimit`, `cors`, `csrf`, `secureHeaders`, `etag`, `compress`, `logger`, `requestId`, `timeout`,
`bearerAuth`, `basicAuth`, `jwt`, `jwk`, `ipRestriction`, `methodNotAllowed`, `trimTrailingSlash`, `appendTrailingSlash`, `some` /
`every` / `except`, and ACRYL's `loopbackOnly` for private loopback routes.
