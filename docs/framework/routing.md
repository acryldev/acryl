# Routing and mounting

Routing has two levels:

1. Routes inside an `App`.
2. Cordis mounts that place an `App` in the host at a base path.

Keeping those levels separate lets application code stay portable while the host controls the public route space.

## HTTP methods

```ts
app.get('/todos', listTodos)
app.post('/todos', createTodo)
app.put('/todos/:id', replaceTodo)
app.patch('/todos/:id', updateTodo)
app.delete('/todos/:id', deleteTodo)
app.options('/todos', options)
app.all('/health', health)              // any method
app.on('PURGE', '/cache', purge)        // a custom method
app.on(['PUT', 'DELETE'], '/post', handler)
app.on('GET', ['/hello', '/en/hello'], handler)
```

`HEAD` is answered from the `GET` route with the body removed. A known path asked with another method answers 404 like an unknown path;
add the `methodNotAllowed` middleware to an app that should answer 405 with an `Allow` header instead.

```ts
import { methodNotAllowed } from 'acryl-router/middleware'

const app = new App()
app.use(methodNotAllowed({ app }))      // POST /item -> 405, Allow: GET, HEAD
app.get('/item', c => c.text('item'))
```

Routes can be chained, and a chained call without a path reuses the last one:

```ts
app
  .get('/endpoint', c => c.text('GET /endpoint'))
  .post(c => c.text('POST /endpoint'))
  .delete(c => c.text('DELETE /endpoint'))
```

Chaining also carries the route types, which the typed `testClient` and `acryl-router/client` read.

## Path parameters

```ts
app.get('/users/:userId/todos/:todoId', c => {
  const { userId, todoId } = c.req.param()
  return c.json({ userId, todoId })
})

app.get('/api/animal/:type?', c => c.text('Animal!'))             // optional: /api/animal and /api/animal/cat
app.get('/post/:date{[0-9]+}/:title{[a-z]+}', handler)            // constrained by a regular expression
app.get('/posts/:filename{.+\\.png}', handler)                    // a parameter that includes slashes
```

Prefer explicit routes over complex patterns when both express the same rule.

## Wildcards

```ts
app.use('/admin/*', requireAdmin)
app.get('/wild/*/card', c => c.text('GET /wild/*/card'))
```

A wildcard is appropriate for a prefix boundary. It should not hide distinct resources that callers need to address independently.

## Priority

Handlers and middleware run in registration order, and the first handler that returns a response ends the request:

```ts
app.get('/book/a', c => c.text('a'))          // GET /book/a -> a
app.get('/book/:slug', c => c.text('common'))  // GET /book/b -> common
```

Put middleware above the handlers it should wrap and a fallback such as `app.get('*', ...)` below the others.

## Grouping related routes

Build a smaller app for a feature, then place it inside another app:

```ts
const todos = new App()
todos.get('/', listTodos)
todos.post('/', createTodo)
todos.get('/:id', showTodo)

const app = new App()
app.route('/todos', todos)
```

`route` copies the routes the sub-app has at that moment. Register them first: a route added to `todos` after `app.route(...)` is not
part of `app`.

## Base paths

```ts
const api = new App().basePath('/api/v1')
api.get('/todos', listTodos)   // GET /api/v1/todos
```

Do not repeat a mount prefix both in `basePath` and in the outer mount unless the doubled path is deliberate.

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

`/a` and `/a/` are different paths. Configure the router with `trailingSlash: 'ignore'` to treat them as one, or use the
`trimTrailingSlash` / `appendTrailingSlash` middleware to redirect.

## Testing routes

```ts
const response = await app.request('/todos/42')
const body = await response.json()
```

Test both the application in isolation and at least one mounted route through the Cordis router. The second test proves the mount,
prefix and disposal contract, not just handler logic.
