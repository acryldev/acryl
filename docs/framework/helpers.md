# Helpers

Helpers are small utilities an application should not have to rewrite. They are plain functions over the context, not Cordis services.
Import them from `acryl-router/helpers`, except the typed client, which has its own entry, `acryl-router/client`.

| Helper | Use |
| --- | --- |
| `stream`, `streamText`, `streamSSE` | streaming responses and server-sent events |
| `getCookie`, `setCookie`, `deleteCookie`, `getSignedCookie`, `setSignedCookie`, `generateCookie`, `generateSignedCookie` | cookies |
| `testClient` | a typed client that calls an app in process, for tests |
| `validator`, `schemaValidator` | input validation, see [Validation](./validation.md) |
| `createMiddleware`, `createFactory` | typed middleware and handlers that share variables |
| `html`, `raw` | escaped HTML templates |
| `accepts` | content negotiation from `Accept` headers |
| `routePath`, `matchedRoutes`, `baseRoutePath`, `basePath` | the route a request matched |
| `getConnInfo`, `connectionOf` | the peer and local port, see [Context](./context.md#transport-facts) |
| `getMimeType`, `getExtension`, `mimes` | media types by file extension |
| `defineWebSocketHelper`, `WSContext` and their types | the runtime-neutral WebSocket pieces an adapter builds on |

JWT signing and verification (`sign`, `verify`, `decode`) live with the `jwt` middleware in `acryl-router/middleware`.

## Streaming

```ts
import { stream, streamSSE, streamText } from 'acryl-router/helpers'

app.get('/stream', c => stream(c, async stream => {
  stream.onAbort(() => console.log('aborted'))
  await stream.write(new Uint8Array([0x48, 0x69]))
  await stream.pipe(anotherReadableStream)
}))

app.get('/text', c => streamText(c, async stream => {
  await stream.writeln('Hello')
  await stream.sleep(1000)
  await stream.write('there')
}))
```

Server-sent events write one message at a time with `writeSSE`:

```ts
app.get('/events', c => streamSSE(c, async stream => {
  let id = 0
  while (!stream.aborted) {
    await stream.writeSSE({ event: 'time', data: new Date().toISOString(), id: String(id++) })
    await stream.sleep(1000)
  }
}))
```

- The callback runs after the response is returned. When it throws, the optional third argument `onError(error, stream)` runs and the
  stream sends an `error` event before it closes.
- There is no built-in keep-alive: send a comment or an event on a timer when a proxy closes idle connections.
- When the plugin that serves the stream unloads, or the router is disposed, the router cancels the response body, so `onAbort` runs,
  `aborted` turns true and a loop that checks `stream.aborted` ends with its owner.

## Cookies

```ts
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'acryl-router/helpers'

app.get('/cookie', c => {
  setCookie(c, 'theme', 'dark', { path: '/', httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 60 * 60 * 24 })
  const theme = getCookie(c, 'theme')
  const all = getCookie(c)
  deleteCookie(c, 'old')
  return c.json({ theme, all })
})

app.get('/signed', async c => {
  await setSignedCookie(c, 'session', 'value', secret)
  const session = await getSignedCookie(c, secret, 'session')   // false when the signature does not match
  return c.json({ session })
})
```

`generateCookie` and `generateSignedCookie` return the `Set-Cookie` string without touching a context. The `__Secure-` and `__Host-`
prefixes are available through `{ prefix: 'secure' }` and `{ prefix: 'host' }`, and the options are checked against their rules.

## Testing

`app.request(path, init?)` calls an app in process and returns a `Response`. `testClient` adds the route types:

```ts
import { testClient } from 'acryl-router/helpers'

const app = new App()
  .get('/search', c => c.json({ query: c.req.query('q') }))

const client = testClient(app)
const response = await client.search.$get({ query: { q: 'cordis' } })
expect(await response.json()).toEqual({ query: 'cordis' })
```

The routes must be chained on one expression (as above) for their types to reach the client. Add a test through the Cordis router as well:
an app test cannot prove the mount, the prefix or the disposal.

## The typed client

`acryl-router/client` is the same client for a real server. It runs in a browser or any runtime with `fetch`, without Cordis:

```ts
import { hc } from 'acryl-router/client'
import type { SearchRoutes } from 'my-server'   // the type of the chained app, exported by the server package

const client = hc<SearchRoutes>('http://127.0.0.1:3290/search-app')
const response = await client.search.$get({ query: { q: 'cordis' } })
```

Export the app's type (`export type SearchRoutes = typeof app`) from the server package; the client imports only the type, never the
server code.

## Not yet ported

Proxying, a WebSocket upgrade under the router, JSX, static-site generation, CSS-in-JS and the cache helpers are later tasks (see
`specs/047-framework-port/plan.md`). Add a missing helper to the framework as a ported, tested helper, not as private code in one
application.
