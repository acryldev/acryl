# App - Acryl

`Acryl` is the primary object.
It will be imported first and used until the end.

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()
//...

export default app // for Cloudflare Workers or Bun
```

## Methods

An instance of `Acryl` has the following methods.

- app.**HTTP_METHOD**(\[path,\]handler|middleware...)
- app.**all**(\[path,\]handler|middleware...)
- app.**on**(method|method[], path|path[], handler|middleware...)
- app.**use**(\[path,\]middleware)
- app.**route**(path, \[app\])
- app.**basePath**(path)
- app.**notFound**(handler)
- app.**onError**(err, handler)
- app.**mount**(path, anotherApp, \[options\])
- app.**fire**()
- app.**fetch**(request, env, event)
- app.**request**(path, options)

The first part of them is used for routing, please refer to the [routing section](routing.md).

## Not Found

`app.notFound` allows you to customize a Not Found Response.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.notFound((c) => {
  return c.text('Custom 404 Message', 404)
})
```

> **Warning.** The `notFound` method is only called from the top-level app. For more information, see this issue.

## Error Handling

`app.onError` allows you to handle uncaught errors and return a custom Response.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.onError((err, c) => {
  console.error(`${err}`)
  return c.text('Custom Error Message', 500)
})
```

> **Note.** If both a parent app and its routes have `onError` handlers, the route-level handlers get priority.

## fire()

> **Warning.** **`app.fire()` is deprecated**. Use `fire()` from `acrylblends/service-worker` instead. See the Service Worker documentation for details.

`app.fire()` automatically adds a global `fetch` event listener.

This can be useful for environments that adhere to the [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API), such as [non-ES module Cloudflare Workers](https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/).

`app.fire()` executes the following for you:

```ts
addEventListener('fetch', (event: FetchEventLike): void => {
  event.respondWith(this.dispatch(...))
})
```

## fetch()

`app.fetch` will be the entry point of your application.

For Cloudflare Workers, you can use the following:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
type Env = any
type ExecutionContext = any
// ---cut---
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
}
```

or just do:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
export default app
```

Bun:

<!-- prettier-ignore -->
```ts
export default {
  port: 3000,
  fetch: app.fetch,
}
```

## request()

`request` is a useful method for testing.

You can pass a URL or pathname to send a GET request.
`app` will return a `Response` object.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
declare const test: (name: string, fn: () => void) => void
declare const expect: (value: any) => any
// ---cut---
test('GET /hello is ok', async () => {
  const res = await app.request('/hello')
  expect(res.status).toBe(200)
})
```

You can also pass a `Request` object:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
declare const test: (name: string, fn: () => void) => void
declare const expect: (value: any) => any
// ---cut---
test('POST /message is ok', async () => {
  const req = new Request('Hello!', {
    method: 'POST',
  })
  const res = await app.request(req)
  expect(res.status).toBe(201)
})
```

## mount()

> **Warning.** **`app.mount()` is deprecated**. Use the [Mount Middleware](../middleware/builtin/mount.md) instead.

The `mount()` allows you to mount applications built with other frameworks into your Acryl application.

```ts
import { Router as IttyRouter } from 'itty-router'
import { Acryl } from 'acrylblends'

// Create itty-router application
const ittyRouter = IttyRouter()

// Handle `GET /itty-router/hello`
ittyRouter.get('/hello', () => new Response('Hello from itty-router'))

// Acryl application
const app = new Acryl()

// Mount!
app.mount('/itty-router', ittyRouter.handle)
```

By default, `mount()` passes a new `Request` with the mount path removed from its URL. Provide a `replaceRequest` function to control which `Request` is passed to the mounted application:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
const handler = (request: Request) => new Response(request.url)
// ---cut---
app.mount('/app', handler, {
  replaceRequest: (originalRequest) => originalRequest,
})
```

To pass the original `Request` unchanged, set `replaceRequest` to `false` as a shorthand for the function above:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
const handler = (request: Request) => new Response(request.url)
// ---cut---
app.mount('/app', handler, {
  replaceRequest: false,
})
```

## strict mode

Strict mode defaults to `true` and distinguishes the following routes.

- `/hello`
- `/hello/`

`app.get('/hello')` will not match `GET /hello/`.

By setting strict mode to `false`, both paths will be treated equally.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const app = new Acryl({ strict: false })
```

## router option

The `router` option specifies which router to use. The default router is `SmartRouter`. If you want to use `RegExpRouter`, pass it to a new `Acryl` instance:

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
import { RegExpRouter } from 'acrylblends/router/reg-exp-router'

const app = new Acryl({ router: new RegExpRouter() })
```

## Generics

You can pass Generics to specify the types of Cloudflare Workers Bindings and variables used in `c.set`/`c.get`.

```ts twoslash
import { Acryl } from 'acrylblends'
type User = any
declare const user: User
// ---cut---
type Bindings = {
  TOKEN: string
}

type Variables = {
  user: User
}

const app = new Acryl<{
  Bindings: Bindings
  Variables: Variables
}>()

app.use('/auth/*', async (c, next) => {
  const token = c.env.TOKEN // token is `string`
  // ...
  c.set('user', user) // user should be `User`
  await next()
})
```
