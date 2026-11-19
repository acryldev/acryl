# Transport facts and cancellation

`c.env` carries what the caller of the router supplied for this request. Under the router that is `{ connection }`: the socket's peer
address and the real local port, filled by the HTTP adapter and empty for an in-process call. Transport facts never travel in headers.

```ts
import { Acryl } from 'acrylblends'
import { connectionOf, type RouterEnv } from 'acrylblends/conninfo'
import { getConnInfo } from 'acrylblends/conninfo'

const app = new Acryl<RouterEnv>()   // types c.env.connection
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
import { HTTPException } from 'acrylblends/http-exception'

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
