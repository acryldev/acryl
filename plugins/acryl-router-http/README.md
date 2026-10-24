# acryl-router-http

The Web adapter for [`acryl-router`](../acryl-router/README.md) (spec 046, milestone M2). A plugin that owns routes on the
router asks for a path prefix to be served over HTTP:

```ts
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.route('/api/market', new App().get('/:id', c => c.json({ id: c.req.param('id') })))
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/market') })   // claim the prefix on the DSH webServer
}
```

- Requests under the prefix are converted to Web `Request` objects (the body is streamed, not buffered) and run through
  `router.fetch`; the `Response` is written back with its status, headers (repeated `set-cookie` kept apart) and streamed body.
- `HEAD` is answered from the `GET` route with no body.
- A client that disconnects aborts `c.req.raw.signal`, so a handler that honors it stops.
- A mount is removed when the owning plugin unloads, and the adapter stays PENDING until both `router` and `webServer` exist.
- Desktop reaches the Host's web server on a loopback port, so it uses this package exactly as Web does. The terminal UI and tests
  do not need it: they call `ctx.router.fetch(...)` in process.

A prefix matches the path itself and everything below it, following the `webServer` rule. Mounting a prefix another route
already claims throws.

Row id and package name: `acryl-router-http`.
