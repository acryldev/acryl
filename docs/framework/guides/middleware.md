# Middleware

Middleware works before/after the endpoint `Handler`. We can get the `Request` before dispatching or manipulate the `Response` after dispatching.

## Definition of Middleware

- Handler - should return `Response` object. Only one handler will be called.
- Middleware - should `await next()` and return nothing to call the next Middleware, **or** return a `Response` to early-exit.

The user can register middleware using `app.use` or using `app.HTTP_METHOD` as well as the handlers. For this feature, it's easy to specify the path and the method.

```ts
// match any method, all routes
app.use(logger())

// specify path
app.use('/posts/*', cors())

// specify method and path
app.post('/posts/*', basicAuth())
```

If the handler returns `Response`, it will be used for the end-user and will stop processing.

```ts
app.post('/posts', (c) => c.text('Created!', 201))
```

In this case, four middleware are processed before dispatching like this:

```ts
logger() -> cors() -> basicAuth() -> *handler*
```

## Execution order

The order in which Middleware is executed is determined by the order in which it is registered.
The process before the `next` of the first registered Middleware is executed first,
and the process after the `next` is executed last.
See below.

```ts
app.use(async (_, next) => {
  console.log('middleware 1 start')
  await next()
  console.log('middleware 1 end')
})
app.use(async (_, next) => {
  console.log('middleware 2 start')
  await next()
  console.log('middleware 2 end')
})
app.use(async (_, next) => {
  console.log('middleware 3 start')
  await next()
  console.log('middleware 3 end')
})

app.get('/', (c) => {
  console.log('handler')
  return c.text('Hello!')
})
```

Result is the following.

```
middleware 1 start
  middleware 2 start
    middleware 3 start
      handler
    middleware 3 end
  middleware 2 end
middleware 1 end
```

Note that if the handler or any middleware throws, acrylblends will catch it and either pass it to [your app.onError() callback](../api/acryl.md#error-handling) or automatically convert it to a 500 response before returning it up the chain of middleware. This means that next() will never throw, so there is no need to wrap it in a try/catch/finally.

## Built-in Middleware

Acryl has built-in middleware.

```ts
import { Acryl } from 'acrylblends'
import { poweredBy } from 'acrylblends/powered-by'
import { logger } from 'acrylblends/logger'
import { basicAuth } from 'acrylblends/basic-auth'

const app = new Acryl()

app.use(poweredBy())
app.use(logger())

app.use(
  '/auth/*',
  basicAuth({
    username: 'acrylblends',
    password: 'acoolproject',
  })
)
```

**Warning.**

For example, this code is not working because the version is different.

```ts
import { Acryl } from 'npm:acrylblends'
import { upgradeWebSocket } from 'npm:acrylblends'

const app = new Acryl()

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    // ...
  }))
)
```

## Custom Middleware

You can write your own middleware directly inside `app.use()`:

```ts
// Custom logger
app.use(async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`)
  await next()
})

// Add a custom header
app.use('/message/*', async (c, next) => {
  await next()
  c.header('x-message', 'This is middleware!')
})

app.get('/message/hello', (c) => c.text('Hello Middleware!'))
```

However, embedding middleware directly within `app.use()` can limit its reusability. Therefore, we can separate our middleware into different files.

To ensure we don't lose type definitions for `context` and `next`, when separating middleware, we can use [`createMiddleware()`](../helpers/factory.md#createmiddleware) from Acryl's factory. This also allows us to type-safely [access data we've `set` in `Context`](../api/context.md#set-get) from downstream handlers.

```ts
import { createMiddleware } from 'acrylblends/factory'

const logger = createMiddleware(async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`)
  await next()
})
```

**Note.**

Type generics can be used with `createMiddleware`:

```ts
createMiddleware<{Bindings: Bindings}>(async (c, next) =>
```

### Modify the Response After Next

Additionally, middleware can be designed to modify responses if necessary:

```ts
const stripRes = createMiddleware(async (c, next) => {
  await next()
  c.res = undefined
  c.res = new Response('New Response')
})
```

## Context access inside Middleware arguments

To access the context inside middleware arguments, directly use the context parameter provided by `app.use`. See the example below for clarification.

```ts
import { cors } from 'acrylblends/cors'

app.use('*', async (c, next) => {
  const middleware = cors({
    origin: c.env.CORS_ORIGIN,
  })
  return middleware(c, next)
})
```

### Extending the Context in Middleware

To extend the context inside middleware, use `c.set`. You can make this type-safe by passing a `{ Variables: { yourVariable: YourVariableType } }` generic argument to the `createMiddleware` function.

```ts
import { createMiddleware } from 'acrylblends/factory'

const echoMiddleware = createMiddleware<{
  Variables: {
    echo: (str: string) => string
  }
}>(async (c, next) => {
  c.set('echo', (str) => str)
  await next()
})

app.get('/echo', echoMiddleware, (c) => {
  return c.text(c.var.echo('Hello!'))
})
```

### Type Inference Across Chained Middleware

When you chain multiple middleware using `.use()`, Acryl automatically accumulates the `Variables` types. Route handlers that follow the middleware chain can access all variables from every preceding middleware in a type-safe way:

```ts
import { createMiddleware } from 'acrylblends/factory'

const authMiddleware = createMiddleware<{
  Variables: { user: { id: string; name: string } }
}>(async (c, next) => {
  c.set('user', { id: '123', name: 'Alice' })
  await next()
})

const dbMiddleware = createMiddleware<{
  Variables: { db: { query: (sql: string) => Promise<unknown> } }
}>(async (c, next) => {
  c.set('db', {
    query: async (sql) => {
      /* ... */
    },
  })
  await next()
})

const app = new Acryl()
  .use(authMiddleware)
  .use(dbMiddleware)
  .get('/', (c) => {
    // Both `user` and `db` are available and type-safe
    const user = c.var.user // { id: string; name: string }
    const db = c.var.db // { query: (sql: string) => Promise<unknown> }
    return c.json({ user })
  })
```

This works because each `.use()` call returns a new Acryl instance with the merged type, so the type grows as middleware is chained. This eliminates the need to manually declare a combined `Env` type upfront for most use cases.

## Third-party Middleware

Built-in middleware does not depend on external modules, but third-party middleware can depend on third-party libraries. So with them, we may make a more complex application.

We can explore a variety of third-party middleware.
For example, we have GraphQL Server Middleware, Sentry Middleware, Firebase Auth Middleware, and others.
