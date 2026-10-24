# Best Practices

Acryl is very flexible. You can write your app as you like.
However, there are best practices that are better to follow.

## Don't make "Controllers" when possible

When possible, you should not create "Ruby on Rails-like Controllers".

```ts
// 🙁
// A RoR-like Controller
const booksList = (c: Context) => {
  return c.json('list books')
}

app.get('/books', booksList)
```

The issue is related to types. For example, the path parameter cannot be inferred in the Controller without writing complex generics.

```ts
// 🙁
// A RoR-like Controller
const bookPermalink = (c: Context) => {
  const id = c.req.param('id') // Can't infer the path param
  return c.json(`get ${id}`)
}
```

Therefore, you don't need to create RoR-like controllers and should write handlers directly after path definitions.

```ts
// 😃
app.get('/books/:id', (c) => {
  const id = c.req.param('id') // Can infer the path param
  return c.json(`get ${id}`)
})
```

## `factory.createHandlers()` in `acrylblends/factory`

If you still want to create a RoR-like Controller, use `factory.createHandlers()` in [`acrylblends/factory`](../helpers/factory.md). If you use this, type inference will work correctly.

```ts
import { createFactory } from 'acrylblends/factory'
import { logger } from 'acrylblends/logger'

declare module 'acrylblends' {
  interface ContextVariableMap {
    foo: string
  }
}

// ...

// 😃
const factory = createFactory()

const middleware = factory.createMiddleware(async (c, next) => {
  c.set('foo', 'bar')
  await next()
})

const handlers = factory.createHandlers(logger(), middleware, (c) => {
  return c.json(c.var.foo)
})

app.get('/api', ...handlers)
```

## Building a larger application

Use `app.route()` to build a larger application without creating "Ruby on Rails-like Controllers".

If your application has `/authors` and `/books` endpoints and you wish to separate files from `index.ts`, create `authors.ts` and `books.ts`.

```ts
// authors.ts
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => c.json('list authors'))
app.post('/', (c) => c.json('create an author', 201))
app.get('/:id', (c) => c.json(`get ${c.req.param('id')}`))

export default app
```

```ts
// books.ts
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => c.json('list books'))
app.post('/', (c) => c.json('create a book', 201))
app.get('/:id', (c) => c.json(`get ${c.req.param('id')}`))

export default app
```

Then, import them and mount on the paths `/authors` and `/books` with `app.route()`.

```ts
// index.ts
import { Acryl } from 'acrylblends'
import authors from './authors'
import books from './books'

const app = new Acryl()

// 😃
app.route('/authors', authors)
app.route('/books', books)

export default app
```

### If you want to use RPC features

The code above works well for normal use cases.
However, if you want to use the `RPC` feature, you can get the correct type by chaining as follows.

```ts
// authors.ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
  .get('/', (c) => c.json('list authors'))
  .post('/', (c) => c.json('create an author', 201))
  .get('/:id', (c) => c.json(`get ${c.req.param('id')}`))

export default app
export type AppType = typeof app
```

If you pass the type of the `app` to `hc`, it will get the correct type.

```ts
import type { AppType } from './authors'
import { hc } from 'acrylblends/client'

// 😃
const client = hc<AppType>('http://localhost') // Typed correctly
```

For more detailed information, please see [the RPC page](rpc.md#using-rpc-with-larger-applications).

## HEAD Request Best Practices

### Understanding Acryl's HEAD Handling

Acryl automatically handles HEAD requests by converting them to GET requests and stripping the response body. This behavior is built into the framework's dispatch layer and happens before route matching occurs.

### ✅ Do: Use GET Routes for HEAD Requests

```ts
// GOOD: This GET route automatically handles HEAD requests
app.get('/api/users', async (c) => {
  const users = await getUsers()
  c.header('X-Total-Count', users.length.toString())
  return c.json(users)
})

// HEAD /api/users will return:
// - Same headers as GET (including X-Total-Count)
// - Status 200
// - No body (null)
```

### ✅ Do: Use Middleware for HEAD-Specific Logic

```ts
// GOOD: Use middleware when HEAD needs different behavior
app.use('/api/resource', async (c, next) => {
  await next()

  // Add HEAD-specific headers after the handler
  if (c.req.method === 'HEAD') {
    c.header('X-HEAD-Processed', 'true')
    // Don't compute expensive body content for HEAD
    c.res = new Response(null, c.res)
  }
})
```

### ❌ Don't: Try to Create Dedicated HEAD Handlers

```ts
// BAD: This won't work as expected
app.head('/api/users', (c) => {
  // This handler will NEVER be called
  c.header('X-Custom', 'value')
  return c.text('ignored')
})

// BAD: Using on() also won't work
app.on('HEAD', '/api/users', (c) => {
  // Still converted to GET before route matching
})
```

### Performance Considerations

- **Avoid expensive operations in GET handlers if you expect many HEAD requests**: Use middleware to detect HEAD and skip body generation
- **Cache headers work identically**: HEAD responses respect the same caching rules as GET
- **Middleware compatibility**: Most middleware works with HEAD, but body-processing middleware (like compression) automatically skips HEAD requests

### Testing HEAD Requests

```ts
// Always test both GET and HEAD responses
it('handles HEAD requests correctly', async () => {
  const getRes = await app.request('/api/users')
  const headRes = await app.request('/api/users', { method: 'HEAD' })

  expect(headRes.status).toBe(getRes.status)
  expect(headRes.headers.get('X-Total-Count')).toBe(
    getRes.headers.get('X-Total-Count')
  )
  expect(headRes.body).toBe(null)
})
```

### Notes

- The automatic HEAD conversion ensures consistent headers between GET and HEAD responses
- This behavior is consistent across all Acryl runtimes (Cloudflare Workers, Deno, Bun, Node.js)
- If you need completely different logic for HEAD vs GET, consider using different endpoints rather than trying to override the framework's HEAD handling
