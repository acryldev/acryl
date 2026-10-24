# Middleware

Middleware is code that runs around a handler. Use it for behavior shared by several routes: authentication, authorization, logging, CORS,
caching, compression, request IDs and timing.

## Write middleware

```ts
import type { MiddlewareHandler } from 'acryl-router'

const timing: MiddlewareHandler = async (c, next) => {
  const started = performance.now()
  await next()
  c.header('X-Response-Time', String(Math.round(performance.now() - started)))
}

app.use(timing)
```

`await next()` runs the remaining middleware and then the handler. Not calling it ends the chain, so middleware that refuses a request
returns a response itself:

```ts
const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!isAdmin(c)) return c.json({ error: 'forbidden' }, 403)
  await next()
}
```

Middleware does not return a response *and* call `next()`: after `next()` it changes `c.res` (or assigns a new `Response` to it) instead.

Authentication establishes an identity; authorization decides whether that identity may do this. Keep them as separate middleware when
their failure answers differ.

## Scope and order

```ts
app.use(requestLogger)               // every route of this app
app.use('/admin/*', requireAdmin)    // below a prefix
app.on(['POST', 'PUT'], '/items/*', audit)
```

Middleware runs in registration order and only wraps routes registered after it. The first middleware registered is the outermost: its code
before `next()` runs first and its code after `next()` runs last.

## Share values with handlers

`createMiddleware` types the variables a middleware sets, and the app picks them up when it is chained:

```ts
import { createMiddleware } from 'acryl-router/helpers'

const withUser = createMiddleware<{ Variables: { user: User } }>(async (c, next) => {
  c.set('user', await loadUser(c))
  await next()
})

const app = new App().use(withUser).get('/me', c => c.json(c.var.user))
```

Only request-local values belong here. Shared services belong behind Cordis injection.

## Errors

`await next()` does not throw. When a handler or later middleware throws, the error becomes a response first (an `HTTPException` its own,
anything else through `onError`) and is left in `c.error`:

```ts
app.use(async (c, next) => {
  await next()
  if (c.error) metrics.count('request_failed')
})
```

So a `try { await next() } catch` around `next()` never catches anything. Map domain errors to answers in `app.onError`:

```ts
app.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.code }, error.status)
  console.error(error)
  return c.json({ error: 'internal_error' }, 500)
})
```

## Built-in middleware

Import from `acryl-router/middleware`:

| Middleware | What it does |
| --- | --- |
| `basicAuth`, `bearerAuth` | HTTP Basic and Bearer authentication |
| `jwt`, `jwk` (with `sign`, `verify`, `decode`, `verifyWithJwks`) | JSON Web Token verification, from a secret or a key set |
| `bodyLimit` | refuse a request body over a size, with 413, while it streams |
| `cors` | CORS headers and preflight answers |
| `csrf` | refuse a cross-site form submission by its `Origin` or `Sec-Fetch-Site` |
| `secureHeaders` (with `NONCE`) | security headers, including a content security policy with nonces |
| `ipRestriction` | allow or deny by the peer address (read through `getConnInfo`) |
| `loopbackOnly` (with `loopbackAuthority`, `sameOrigin`) | only requests from this machine to this app; see below |
| `compress` | gzip or deflate the response |
| `etag` | ETag headers and 304 answers |
| `logger` | one log line per request and response |
| `requestId` | a request ID header and `c.var.requestId` |
| `timing` (with `startTime`, `endTime`, `setMetric`, `wrapTime`) | `Server-Timing` headers |
| `timeout` | answer with an error when a handler takes too long |
| `prettyJSON` | indented JSON when the query asks for it |
| `poweredBy` | an `X-Powered-By` header |
| `methodNotAllowed({ app })` | 405 with an `Allow` header for a known path of `app` asked with another method |
| `methodOverride` | take the method from a form field, header or query |
| `trimTrailingSlash`, `appendTrailingSlash` | redirect to the canonical path |
| `languageDetector` (with `detectFromPath`, `detectFromQuery`, `detectFromCookie`, `detectFromHeader`) | the request's language as a variable |
| `contextStorage` (with `getContext`, `tryGetContext`) | the current context from code that is not given `c` |
| `every`, `some`, `except` | combine middleware: all, the first that passes, or all except on some paths |
| `serveStatic` | the runtime-neutral static file middleware; it needs a `getContent`. On Node use the one from `acryl-node-server` |

### loopbackOnly

The guard for a local app's own routes, such as a control API a desktop window calls:

```ts
import { loopbackOnly } from 'acryl-router/middleware'

app.use('/control/*', loopbackOnly())
```

A request passes only when:

- the peer is a loopback address and arrived on the real local port, both read from the transport, never from a header;
- the `Host` header names a loopback hostname (`127.0.0.1`, `localhost`, `[::1]`, or `hostnames`) with that port, which stops DNS
  rebinding;
- for a request that changes things (not `GET`, `HEAD`, `OPTIONS`), any `Origin` is this same authority (`mutations: 'none'` turns this
  off).

An in-process call has no socket and is refused unless `inProcess: 'allow'` says the host's own code may call it. Everything refused gets a
403.

A private route that no other program on the machine may call either, such as a workspace's file and terminal routes, takes
`callers: 'own-page'`:

```ts
app.use('/api/workspace/*', loopbackOnly({ callers: 'own-page', hostnames: ['127.0.0.1'] }))
```

Then every request must come from a page this app served: an `Origin` that is exactly this authority (with `Sec-Fetch-Site` absent or
`same-origin`), or, for a read, which browsers often send without `Origin`, `Sec-Fetch-Site: same-origin` and a `Referer` from this
authority. A script with no `Origin` is refused even for a read. `fromOwnPage(c, authority)` is the same check for middleware of your own.

## Middleware in Cordis

Middleware belongs to an `App`; it is not a separate Cordis registration, and it disappears with the mount that serves it. A plugin may
build middleware from an injected service, but resources the middleware uses (timers, watchers, connections) are acquired in the plugin's
`ctx.effect()` and only the finished middleware goes into the app. Do not start timers, watchers or sockets from a handler.

Middleware an app registers with a path wraps the matching routes of every later mount too (an app mounted at `/` with
`app.use('/todo/*', ...)` wraps a plugin mounted at `/todo`), so a host can put a guard in front of other plugins by mounting first.
