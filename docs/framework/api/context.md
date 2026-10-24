# Context

The `Context` object is instantiated for each request and kept until the response is returned. You can put values in it, set headers and a status code you want to return, and access AcrylRequest and Response objects.

## req

`req` is an instance of AcrylRequest. For more details, see [AcrylRequest](request.md).

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/hello', (c) => {
  const userAgent = c.req.header('User-Agent')
  // ...
  // ---cut-start---
  return c.text(`Hello, ${userAgent}`)
  // ---cut-end---
})
```

## status()

You can set an HTTP status code with `c.status()`. The default is `200`. You don't have to use `c.status()` if the code is `200`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/posts', (c) => {
  // Set HTTP status code
  c.status(201)
  return c.text('Your post is created!')
})
```

## header()

You can set HTTP Headers for the response.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/', (c) => {
  // Set headers
  c.header('X-Message', 'My custom message')
  return c.text('Hello!')
})
```

## body()

Return an HTTP response.

> **Note.** When returning text or HTML, it is recommended to use `c.text()` or `c.html()`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/welcome', (c) => {
  c.header('Content-Type', 'text/plain')
  // Return the response body
  return c.body('Thank you for coming')
})
```

You can also write the following.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/welcome', (c) => {
  return c.body('Thank you for coming', 201, {
    'X-Message': 'Hello!',
    'Content-Type': 'text/plain',
  })
})
```

The response is the same `Response` object as below.

```ts twoslash
new Response('Thank you for coming', {
  status: 201,
  headers: {
    'X-Message': 'Hello!',
    'Content-Type': 'text/plain',
  },
})
```

## text()

Render text as `Content-Type: text/plain`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/say', (c) => {
  return c.text('Hello!')
})
```

## json()

Render JSON as `Content-Type: application/json`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/api', (c) => {
  return c.json({ message: 'Hello!' })
})
```

## html()

Render HTML as `Content-Type: text/html`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/', (c) => {
  return c.html('<h1>Hello! Acryl!</h1>')
})
```

## notFound()

Return a `Not Found` Response. You can customize it with [`app.notFound()`](acryl.md#not-found).

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/notfound', (c) => {
  return c.notFound()
})
```

## redirect()

Redirect, default status code is `302`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/redirect', (c) => {
  return c.redirect('/')
})
app.get('/redirect-permanently', (c) => {
  return c.redirect('/', 301)
})
```

## res

You can access the [Response] object that will be returned.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
// Response object
app.use('/', async (c, next) => {
  await next()
  c.res.headers.append('X-Debug', 'Debug message')
})
```

[Response]: https://developer.mozilla.org/en-US/docs/Web/API/Response

## set() / get()

Get and set arbitrary key-value pairs, with a lifetime of the current request. This allows passing specific values between middleware or from middleware to route handlers.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl<{ Variables: { message: string } }>()
// ---cut---
app.use(async (c, next) => {
  c.set('message', 'Acryl is cool!!')
  await next()
})

app.get('/', (c) => {
  const message = c.get('message')
  return c.text(`The message is "${message}"`)
})
```

Pass the `Variables` as Generics to the constructor of `Acryl` to make it type-safe.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
type Variables = {
  message: string
}

const app = new Acryl<{ Variables: Variables }>()
```

The value of `c.set` / `c.get` are retained only within the same request. They cannot be shared or persisted across different requests.

## var

You can also access the value of a variable with `c.var`.

```ts twoslash
import type { Context } from 'acrylblends'
declare const c: Context
// ---cut---
const result = c.var.client.oneMethod()
```

If you want to create the middleware which provides a custom method,
write like the following:

```ts twoslash
import { Acryl } from 'acrylblends'
import { createMiddleware } from 'acrylblends/factory'
// ---cut---
type Env = {
  Variables: {
    echo: (str: string) => string
  }
}

const app = new Acryl()

const echoMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set('echo', (str) => str)
  await next()
})

app.get('/echo', echoMiddleware, (c) => {
  return c.text(c.var.echo('Hello!'))
})
```

If you want to use the middleware in multiple handlers, you can use `app.use()`.
Then, you have to pass the `Env` as Generics to the constructor of `Acryl` to make it type-safe.

```ts twoslash
import { Acryl } from 'acrylblends'
import type { MiddlewareHandler } from 'acrylblends/types'
declare const echoMiddleware: MiddlewareHandler
type Env = {
  Variables: {
    echo: (str: string) => string
  }
}
// ---cut---
const app = new Acryl<Env>()

app.use(echoMiddleware)

app.get('/echo', (c) => {
  return c.text(c.var.echo('Hello!'))
})
```

## render() / setRenderer()

You can set a layout using `c.setRenderer()` within a custom middleware.

```tsx
/** @jsx jsx */
/** @jsxImportSource acrylblends/jsx */
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.use(async (c, next) => {
  c.setRenderer((content) => {
    return c.html(
      <html>
        <body>
          <p>{content}</p>
        </body>
      </html>
    )
  })
  await next()
})
```

Then, you can utilize `c.render()` to create responses within this layout.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/', (c) => {
  return c.render('Hello!')
})
```

The output of which will be:

```html
<html>
  <body>
    <p>Hello!</p>
  </body>
</html>
```

Additionally, this feature offers the flexibility to customize arguments.
To ensure type safety, types can be defined as:

```ts
declare module 'acrylblends' {
  interface ContextRenderer {
    (
      content: string | Promise<string>,
      head: { title: string }
    ): Response | Promise<Response>
  }
}
```

Here's an example of how you can use this:

```ts
app.use('/pages/*', async (c, next) => {
  c.setRenderer((content, head) => {
    return c.html(
      <html>
        <head>
          <title>{head.title}</title>
        </head>
        <body>
          <header>{head.title}</header>
          <p>{content}</p>
        </body>
      </html>
    )
  })
  await next()
})

app.get('/pages/my-favorite', (c) => {
  return c.render(<p>Ramen and Sushi</p>, {
    title: 'My favorite',
  })
})

app.get('/pages/my-hobbies', (c) => {
  return c.render(<p>Watching baseball</p>, {
    title: 'My hobbies',
  })
})
```

## executionCtx

You can access Cloudflare Workers' specific [ExecutionContext](https://developers.cloudflare.com/workers/runtime-apis/context/).

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl<{
  Bindings: {
    KV: any
  }
}>()
declare const key: string
declare const data: string
// ---cut---
// ExecutionContext object
app.get('/foo', async (c) => {
  c.executionCtx.waitUntil(c.env.KV.put(key, data))
  // ...
})
```

The `ExecutionContext` also has an [`exports`](https://developers.cloudflare.com/workers/runtime-apis/context/#exports) field. To get autocomplete with Wrangler's generated types, you can use module augmentation:

```ts
import 'acrylblends'

declare module 'acrylblends' {
  interface ExecutionContext {
    readonly exports: Cloudflare.Exports
  }
}
```

## event

You can access Cloudflare Workers' specific `FetchEvent`. This was used in "Service Worker" syntax. But, it is not recommended now.

```ts twoslash
import { Acryl } from 'acrylblends'
declare const key: string
declare const data: string
type KVNamespace = any
// ---cut---
// Type definition to make type inference
type Bindings = {
  MY_KV: KVNamespace
}

const app = new Acryl<{ Bindings: Bindings }>()

// FetchEvent object (only set when using Service Worker syntax)
app.get('/foo', async (c) => {
  c.event.waitUntil(c.env.MY_KV.put(key, data))
  // ...
})
```

## env

In Cloudflare Workers Environment variables, secrets, KV namespaces, D1 database, R2 bucket etc. that are bound to a worker are known as bindings.
Regardless of type, bindings are always available as global variables and can be accessed via the context `c.env.BINDING_KEY`.

```ts twoslash
import { Acryl } from 'acrylblends'
type KVNamespace = any
// ---cut---
// Type definition to make type inference
type Bindings = {
  MY_KV: KVNamespace
}

const app = new Acryl<{ Bindings: Bindings }>()

// Environment object for Cloudflare Workers
app.get('/', async (c) => {
  c.env.MY_KV.get('my-key')
  // ...
})
```

## error

If the Handler throws an error, the error object is placed in `c.error`.
You can access it in your middleware.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.use(async (c, next) => {
  await next()
  if (c.error) {
    // do something...
  }
})
```

## ContextVariableMap

**Warning.**

`ContextVariableMap` adds types **globally** to all contexts, regardless of whether the middleware that sets the variable has actually run. This means `c.get('result')` will appear type-safe even in handlers where your middleware was never registered, potentially hiding `undefined` bugs at runtime.

Take a look at the following example:

```ts
declare module 'acrylblends' {
  interface ContextVariableMap {
    result: string
  }
}

const mw = createMiddleware(async (c, next) => {
  c.set('result', 'some values')
  await next()
})

const app = new Acryl()

// handler uses the middleware
app.get('/foo', mw, (c) => {
  const val = c.get('result') // ✅ val is a string and typed as such, as expected
})

// handler doesn't use the middleware
app.get('/bar', (c) => {
  const val = c.get('result') // ❌ val is undefined but typed as a string, which can lead to runtime errors
})
```

You can augment the `ContextVariableMap` interface to define types for context variables globally across your entire application. This is appropriate when a variable is set by middleware that is applied app-wide and is guaranteed to exist in the context.

For example:

```ts
declare module 'acrylblends' {
  interface ContextVariableMap {
    result: string
  }
}
```

You can then utilize this in your middleware:

```ts twoslash
import { createMiddleware } from 'acrylblends/factory'
// ---cut---
const mw = createMiddleware(async (c, next) => {
  c.set('result', 'some values') // result is a string
  await next()
})
```

In a handler, the variable is inferred as the proper type:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl<{ Variables: { result: string } }>()
// ---cut---
app.get('/', (c) => {
  const val = c.get('result') // val is a string
  // ...
  return c.json({ result: val })
})
```
