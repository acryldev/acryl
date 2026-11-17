# Mounting and trailing slashes

How a Cordis plugin serves an `Acryl` app, what happens to errors and unknown paths, and how trailing slashes behave. For routing itself (methods, parameters, wildcards, grouping) see the [routing API](../api/routing.md).

## Mounting from Cordis

A plugin mounts its app through the `router` service:

```ts
export const name = 'todo'
export const inject = ['router']

export function apply(ctx: Context): void {
  const app = createTodoApp()
  ctx.router.route('/todo', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
}
```

- The mount is owned by the calling plugin: `route` registers it as that plugin's effect, so unloading the plugin removes it and a reload
  mounts again without duplicates. The returned function removes it sooner.
- `route` copies the app's routes at the call, like `app.route`; mount the app once it is complete.
- Mounts run in the order they were made, so middleware an earlier mount registers for a path (`app.use('/todo/*', ...)` mounted at `/`)
  wraps routes a later mount serves below it. Two plugins may mount on the same path: the first one's matching route answers, and when it
  unloads the second takes over.
- `ctx.router.route` is the only way to register with the router.
- To be reachable over HTTP inside the ACRYL Host, ask the adapter to serve the prefix with `routerHttp.mount(prefix)` (an optional
  dependency, hence the inner `ctx.inject`). A standalone `acryl-node-server` serves the whole router, so there the call is not needed.

## Not found and errors

An app's own error handler applies to that app's routes, also when the app is mounted:

```ts
app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'internal_error' }, 500)
})
```

A mounted app's `app.notFound` is not used: a request no mount claims is answered by the router. A plugin can replace that answer, and
the router's fallback error handler, once per router:

```ts
ctx.router.notFound(c => c.json({ error: 'not_found' }, 404))
ctx.router.onError((error, c) => c.json({ error: 'internal_error' }, 500))
```

Without them, an `HTTPException` becomes its own response, an aborted request is a 499 and anything else is logged and becomes a 500.
Return client errors from the handler that detected them (or throw an `HTTPException`); reserve `onError` for unexpected failures.

## Trailing slashes

`/a` and `/a/` are different paths by default. That surprises people most on a mount's root: an app mounted at `/orders` with a route
`/` answers `/orders` and returns 404 on `/orders/`.

What each choice does for an app mounted at `/orders` with routes `/` and `/:id`, measured on the router:

| Choice | `/orders` | `/orders/` | `/orders/42` | `/orders/42/` |
| --- | --- | --- | --- | --- |
| nothing (the default) | 200 | 404 | 200 | 404 |
| `.use(trimTrailingSlash())` in the app | 200 | 301 to `/orders` | 200 | 301 to `/orders/42` |
| `acryl-router` row config `trailingSlash: 'ignore'` | 200 | 200 | 200 | 200 |
| `new Acryl({ strict: false })` for the mounted app | 200 | 404 | 200 | 404 |

- **`trimTrailingSlash()`** (from `acrylblends/trailing-slash`) is the choice a plugin makes for itself. It acts after the handlers: only
  a GET or HEAD that would be a 404 and ends in `/` is redirected, so a path you did register with a trailing slash keeps working, and a
  POST, PUT, PATCH or DELETE to `/orders/` stays a 404. `trimTrailingSlash({ alwaysRedirect: true })` redirects before the handlers run,
  which a wildcard route (`/files/*`) needs. `appendTrailingSlash()` does the opposite, for an app whose canonical paths end in `/`.
- **`trailingSlash: 'ignore'`** is the router's own setting and applies to every mount at once, without a redirect. Set it in the
  composition that owns the `acryl-router` row (the Blueprint or profile), not from one plugin.
- **`strict: false`** on an `Acryl` is the core's option and works for an app you serve yourself (`app.fetch`, `app.request`). It has no
  effect on a mounted app, because the router composes all mounts into one root app whose strictness comes from `trailingSlash`.

`examples/acryl-todo` uses `trimTrailingSlash()`: `/todo/` sends the browser to `/todo`, and the API keeps one path per route.

## Testing routes

```ts
const response = await app.request('/todos/42')
const body = await response.json()
```

Test both the application in isolation and at least one mounted route through the Cordis router. The second test proves the mount,
prefix and disposal contract, not just handler logic.
