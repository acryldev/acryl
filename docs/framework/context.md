# Context

Every handler and middleware receives a context, normally named `c`. The context connects the current request, the response being built,
route data, transport information and work that must finish after the response. It lives for one request.

## Return a response

```ts
app.get('/text', c => c.text('Hello'))
app.get('/json', c => c.json({ ok: true }))
app.get('/html', c => c.html('<h1>Hello</h1>'))
app.get('/empty', c => c.body(null, 204))
app.get('/raw', () => new Response('Good morning!'))
app.get('/notfound', c => c.notFound())
app.get('/redirect', c => c.redirect('/'))              // 302
app.get('/moved', c => c.redirect('/', 301))
```

Set the status and headers before or with the body:

```ts
app.post('/posts', c => {
  c.status(201)
  c.header('X-Message', 'created')
  return c.json({ created: true })
})

app.get('/welcome', c => c.body('Thank you for coming', 201, { 'X-Message': 'Hello!', 'Content-Type': 'text/plain' }))
```

## The response on the way out

Middleware can read or replace the response after `next()`:

```ts
app.use(async (c, next) => {
  await next()
  c.res.headers.append('X-Debug', 'Debug message')
})
```

## Read request data

The request object is `c.req`:

```ts
const id = c.req.param('id')
const search = c.req.query('q')
const agent = c.req.header('User-Agent')
```

See [Request](./request.md) for bodies, repeated values and validated input.

## Store request-local values

`c.set` and `c.get` (or `c.var.name`) pass data from middleware to handlers. Declare the variables as the app's type parameter so both
sides agree:

```ts
const app = new App<{ Variables: { requestId: string } }>()

app.use(async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
})

app.get('/', c => c.text(c.get('requestId')))
```

These values live only for the current request. Do not use them as a cache or as application state. `createMiddleware` (from
`acryl-router/helpers`) types a middleware that sets variables, and chained `.use(...)` calls accumulate their types; see
[Middleware](./middleware.md).

## Transport facts

`c.env` carries what the caller of the router supplied for this request. Under the router that is `{ connection }`: the socket's peer
address and the real local port, filled by the HTTP adapter and empty for an in-process call. Transport facts never travel in headers.

```ts
import { App, connectionOf, type RouterEnv } from 'acryl-router'
import { getConnInfo } from 'acryl-router/helpers'

const app = new App<RouterEnv>()   // types c.env.connection
app.get('/peer', c => c.json({
  connection: connectionOf(c),     // { remoteAddress?, localPort? }
  info: getConnInfo(c),            // the same peer in the core's conninfo shape, for middleware such as ipRestriction
}))
```

The same handler then runs over HTTP, in process or in a test, and reads an empty connection where there is no socket. Guards such as
`loopbackOnly` refuse an empty one unless told otherwise.

## Cancellation and background work

- `c.req.raw.signal` aborts when the caller goes away, when the plugin whose code is serving the request unloads, and when the router is
  disposed. Long work
  should pass it on (`fetch(url, { signal: c.req.raw.signal })`) or check it.
- `c.executionCtx.waitUntil(promise)` keeps the request in flight until the promise settles, for work that continues after the response
  is returned.

Both belong to the current request, and both end with their owner: see [Plugin lifecycle](./plugin-lifecycle.md#disposal-sequence).

## Errors and control flow

Return a response for expected failures, or throw an `HTTPException`, which becomes its own response:

```ts
import { HTTPException } from 'acryl-router'

if (!todo) return c.json({ error: 'todo_not_found' }, 404)
if (!allowed) throw new HTTPException(403, { message: 'not yours' })
```

Anything else that is thrown goes to the app's `onError`, or to the router's when the app has none. A middleware's `await next()` never
throws: the error has already become a response by then, and the error itself is in `c.error`:

```ts
app.use(async (c, next) => {
  await next()
  if (c.error) report(c.error)
})
```

## Context rules

- Treat the context as request-local.
- Do not retain it after the handler returns.
- Do not put sockets, server objects or Cordis internals into context values for other plugins to discover accidentally.
- Put cross-plugin capabilities in a declared Cordis service, not in `c.set`.
