# Routers

`ctx.router` is one routing table shared by every plugin in the context scope.

- **Match order.** Static segment, then `:param`, then `*`, compared left to right, regardless of registration order. An exact method beats an any-method route.
- **Middleware order.** `use(path, mw)` covers the path and everything below, runs in registration order, and calls `next()` once.
- **Groups.** `router.group('/api/notes', mw1, mw2)` returns a registrar with the same calls (`get`, `post`, `use`, `group`) under that prefix with those middleware.
- **Errors.** A thrown `HttpError` becomes its response; anything else is a logged 500; an aborted request is a 499. `router.onError` and `router.notFound`
  replace the defaults (one handler each).
- **Methods.** `HEAD` is answered from `GET`; a known path with another method answers 405 with `Allow`.
- **Duplicates.** The same method and shape throws at registration, so a conflict shows up when the plugin loads.
