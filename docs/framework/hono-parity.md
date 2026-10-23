# Hono parity

What is the same, what differs, and what is not built. Hono is the model, not a dependency.

| Hono | ACRYL Framework | Notes |
| --- | --- | --- |
| `new Hono()` | `ctx.router` (service of the `acryl-router` plugin) | one router per context scope; plugins register into it |
| `app.get/post/put/patch/delete/all(path, ...handlers)` | same, on `ctx.router` | variadic: leading middleware, final handler |
| `app.on(methods, path, ...)` | `router.on` | |
| `app.use(path?, mw)` | `router.use` | |
| `app.route('/x', sub)` | `router.group('/x', ...mw)` returns a registrar | groups share a prefix and middleware; sub-apps are plugins |
| `app.basePath('/x')` | `router.group('/x')` | |
| `c.req`, `c.req.param()`, `c.req.query()` | `c.req`, `c.param()`, `c.query()` | `c.req` is the Web `Request` |
| `c.json/text/html/body/redirect/notFound` | same | |
| `c.header()`, `c.status()` | same | carried by the response helpers |
| `c.set/get` | same | request-scoped values |
| `c.executionCtx.waitUntil` | `c.waitUntil` | keeps streaming requests in flight; disposal aborts and awaits them |
| `c.env` | not present | a plugin takes services with `inject`; peer facts are `c.connection` |
| `app.onError`, `app.notFound` | `router.onError`, `router.notFound` | one handler each, owned by the registering plugin |
| `HTTPException` | `HttpError` | |
| `app.request(path, init)` | `router.request(path, init)` | in-process, no socket |
| `app.fetch` | `router.fetch(request)` | never throws; 503 once disposed |
| `hono/cors`, `secure-headers`, `request-id`, `logger`, `body-limit` | `acryl-router/middleware` | same names |
| `hono/validator` + Standard Schema | `validate(target, schema)` / `valid(c, target)` | Standard Schema |
| `hono/streaming` `streamSSE` | `streamSSE(c, run)` | |
| `hono/jwt`, `basic-auth`, `etag`, `compress`, `cache`, `csrf`, `html`, `jsx`, `rpc` client | not built | add as plugins when a Blend needs one |
| Presets (`hono/tiny`, `quick`) | not needed | the table is one small pure module |
| Multi-runtime adapters | `acryl-router-http` only | Web uses the DSH `webServer`; Desktop uses its own loopback `webServer`; the terminal calls `fetch` |

What ACRYL adds: registrations belong to a plugin and vanish when it unloads (Hono routes live as long as the app); `c.connection` carries the
transport's facts from the socket, never from headers; `loopbackOnly` guards a route to the local machine; `acryl-state` and `acryl-inspect`.
