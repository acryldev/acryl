# Mount Middleware

> **Not yet available.** The `acrylblends/mount` subpath (an app can still call `app.mount()`) is documented here so the page structure matches the rest of the framework, and is not part of acrylblends yet. The code on this page is not checked by the docs tests.


The Mount Middleware lets you mount an application built with another framework into your Acryl application.

## Import

```ts twoslash
import { Acryl } from 'acrylblends'
import { mount } from 'acrylblends/mount'
```

## Usage

Register the middleware with `app.all()` on a path that ends with `/*`:

```ts
import { Router as IttyRouter } from 'itty-router'

// Create itty-router application
const ittyRouter = IttyRouter()

// Handle `GET /itty-router/hello`
ittyRouter.get('/hello', () => new Response('Hello from itty-router'))

const app = new Acryl()

app.all('/itty-router/*', mount(ittyRouter.handle))
```

By default, the mounted application receives a new `Request` with the matched path prefix removed from its URL. A request to `/itty-router/hello` reaches itty-router as `/hello`.

The mounted application is called as `handler(request, c.env, c.executionCtx)`, the same arguments as a Cloudflare Workers `fetch` handler. Use `optionHandler` to pass different arguments.

## Options

You can pass a function or an object as the second argument.

### *(optional)* optionHandler: `(c: Context) => unknown`

Returns the arguments passed to the mounted application after the `Request`. An array is spread into multiple arguments. You can pass the function directly as the second argument:

```ts twoslash
import { Acryl } from 'acrylblends'
import { mount } from 'acrylblends/mount'
const app = new Acryl()
const anotherApp = (request: Request, ...args: unknown[]) =>
  new Response(request.url)
// ---cut---
// Call `anotherApp(request, c.env)`
app.all(
  '/app/*',
  mount(anotherApp, (c) => c.env)
)

// Call `anotherApp(request, c.env, c.executionCtx)`
app.all(
  '/app/*',
  mount(anotherApp, {
    optionHandler: (c) => [c.env, c.executionCtx],
  })
)
```

### *(optional)* replaceRequest: `((originalRequest: Request) => Request) | false`

Controls which `Request` is passed to the mounted application:

```ts twoslash
import { Acryl } from 'acrylblends'
import { mount } from 'acrylblends/mount'
const app = new Acryl()
const anotherApp = (request: Request, ...args: unknown[]) =>
  new Response(request.url)
// ---cut---
// `/legacy/users` reaches the mounted application as `/api/users`
app.all(
  '/legacy/*',
  mount(anotherApp, {
    replaceRequest: (req) => {
      const url = new URL(req.url)
      url.pathname = url.pathname.replace(/^\/legacy/, '/api')
      return new Request(url, req)
    },
  })
)
```

To pass the original `Request` unchanged, set it to `false` as a shorthand for `(req) => req`:

```ts twoslash
import { Acryl } from 'acrylblends'
import { mount } from 'acrylblends/mount'
const app = new Acryl()
const anotherApp = (request: Request, ...args: unknown[]) =>
  new Response(request.url)
// ---cut---
app.all(
  '/app/*',
  mount(anotherApp, {
    replaceRequest: false,
  })
)
```
