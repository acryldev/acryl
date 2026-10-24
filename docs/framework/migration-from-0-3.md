# Migration from 0.3

0.3.0 had the framework's own small router API: routes registered one at a time on `ctx.router`, and a `RouteContext` with a few
helpers. 0.4.0 replaces it with the ported application API: a plugin builds an `App` and mounts it. The old calls are removed, not kept
as aliases, so there is one way to write a route.

## Before and after

0.3.0:

```ts
import { HttpError } from 'acryl-router'
import { readJson, streamSSE, valid, validate } from 'acryl-router/helpers'
import { bodyLimit } from 'acryl-router/middleware'

export function apply(ctx: Context): void {
  const api = ctx.router.group('/todo')
  api.use(bodyLimit({ maxBytes: 16 * 1024 }))
  api.get('/todos/:id', c => {
    const todo = find(c.param('id'))
    if (!todo) throw new HttpError(404, { message: 'no such todo' })
    return c.json(todo)
  })
  api.post('/todos', validate('json', NewTodo), c => c.json(create(valid(c, 'json')), 201))
  api.get('/events', c => streamSSE(c, stream => {
    const off = events.on('change', todo => stream.send(todo, { event: 'change' }))
    return off
  }))
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
}
```

0.4.0:

```ts
import { App, HTTPException } from 'acryl-router'
import { schemaValidator, streamSSE } from 'acryl-router/helpers'
import { bodyLimit } from 'acryl-router/middleware'

export function apply(ctx: Context): void {
  const app = new App()
    .use(bodyLimit({ maxSize: 16 * 1024 }))
    .get('/todos/:id', c => {
      const todo = find(c.req.param('id'))
      if (!todo) throw new HTTPException(404, { message: 'no such todo' })
      return c.json(todo)
    })
    .post('/todos', schemaValidator('json', NewTodo), c => c.json(create(c.req.valid('json')), 201))
    .get('/events', c => streamSSE(c, async stream => {
      const off = events.on('change', todo => { void stream.writeSSE({ event: 'change', data: JSON.stringify(todo) }) })
      stream.onAbort(off)
      while (!stream.aborted) await stream.sleep(15_000).then(() => stream.write(': keep-alive\n\n'))
    }))

  ctx.router.route('/todo', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
}
```

Public paths do not change: the mount path plus the app's route path is the old group prefix plus the old route path.

## What maps to what

| 0.3.0 | 0.4.0 |
| --- | --- |
| `ctx.router.get/post/put/patch/delete/all/on(path, ...)` | the same methods on an `App`, then `ctx.router.route(prefix, app)` |
| `ctx.router.use(...)` | `app.use(...)` on the app it should wrap (or on an app mounted earlier, for a guard in front of other plugins) |
| `ctx.router.group(prefix, ...middleware)` | one `App` per group mounted at `prefix`, or `app.route(prefix, sub)` / `app.basePath(prefix)` |
| the remover each registration returned | the one remover `ctx.router.route` returns; the mount is owned by the calling plugin as before |
| `ctx.router.onError`, `ctx.router.notFound` | unchanged; an app's own `app.onError` now also applies to its routes |
| `c.param(name)`, `c.params` | `c.req.param(name)`, `c.req.param()` |
| `c.query(name)`, `c.query()` | `c.req.query(name)`, `c.req.query()` (and `c.req.queries(name)` for repeated values) |
| `c.url` | `new URL(c.req.url)`, or `c.req.path` |
| `c.req` (the Web `Request`) | `c.req.raw`; `c.req` is now the request wrapper |
| `c.connection` | `connectionOf(c)` (or `getConnInfo(c)`); type the app `new App<RouterEnv>()` to read `c.env.connection` |
| `c.signal` | `c.req.raw.signal` |
| `c.waitUntil(task)` | `c.executionCtx.waitUntil(task)` |
| `c.get(key)` / `c.set(key, value)` | unchanged, typed by the app's `Variables` (`c.var.key` also works) |
| `c.json/text/html/body/redirect/notFound/header/status` | unchanged |
| `HttpError(status, { message, response, cause })` | `HTTPException(status, { message, res, cause })` |
| `readJson(c)`, `readText(c)`, `readBytes(c)` with `{ maxBytes }` | `bodyLimit({ maxSize })` in front, then `c.req.json()`, `c.req.text()`, `c.req.arrayBuffer()` |
| `bodyLimit({ maxBytes })` | `bodyLimit({ maxSize })` |
| `validate(target, schema)` and `valid(c, target)` | `schemaValidator(target, schema)` and `c.req.valid(target)`, with more targets (`form`, `header`, `cookie`) |
| `streamSSE(c, stream => cleanup)` with `stream.send(data, { event, id })` | `streamSSE(c, async stream => ...)` with `stream.writeSSE({ data, event, id })`; `data` is a string, so `JSON.stringify` objects |
| the SSE stream's automatic keep-alive comment | none: write a comment on a timer when a proxy closes idle connections |
| the cleanup function `run` returned | `stream.onAbort(cleanup)`; the callback's end closes the stream |
| a 405 with `Allow` for a known path and another method | 404 by default; add the `methodNotAllowed` middleware for 405 |
| the `Middleware` type, `(c, next) => Response` | `MiddlewareHandler`, `async (c, next) => { await next() }`; change `c.res` after `next()` instead of returning it |
| `logger`, `cors`, `requestId`, `secureHeaders`, `loopbackOnly` | same names in `acryl-router/middleware`; the first four now take the core's options |

## Behavior changes to check

- **A mount is a snapshot.** Routes an app registers after `ctx.router.route(...)` are not served. 0.3.0 registered each call live.
- **A JSON validator needs a JSON `Content-Type`.** Without it the schema sees `{}`. 0.3.0 read the body whatever its type.
- **`await next()` does not throw.** A thrown error has already become a response; read it from `c.error`.
- **Trailing slashes are strict by default, as before**, and `trailingSlash: 'ignore'` still treats `/a` and `/a/` as one path.
- **Disposal is unchanged:** a plugin's unload ends the requests and streams its code is serving, and router disposal ends all of them,
  bounded by `disposeGraceMs`.

## Checklist

For each plugin:

- collect its route registrations into one app per mount path and keep the public paths;
- move middleware and error handling onto the owning app;
- replace the context and helper calls from the table above;
- run its route tests, then one activation test that unloads and reloads the plugin;
- leave no 0.3.0-style calls behind: the old API is gone, and two styles would give new code a second API to copy.
