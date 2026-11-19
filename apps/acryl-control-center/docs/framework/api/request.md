# AcrylRequest

The `AcrylRequest` is an object that can be taken from `c.req` which wraps a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.

## param()

Get the values of path parameters.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
// Captured params
app.get('/entry/:id', async (c) => {
  const id = c.req.param('id')
  //    ^?
  // ...
})

// Get all params at once
app.get('/entry/:id/comment/:commentId', async (c) => {
  const { id, commentId } = c.req.param()
  //      ^?
})
```

## query()

Get querystring parameters.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
// Query params
app.get('/search', async (c) => {
  const query = c.req.query('q')
  //     ^?
})

// Get all params at once
app.get('/search', async (c) => {
  const { q, limit, offset } = c.req.query()
  //      ^?
})
```

## queries()

Get multiple querystring parameter values, e.g. `/search?tags=A&tags=B`

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/search', async (c) => {
  // tags will be string[]
  const tags = c.req.queries('tags')
  //     ^?
  // ...
})
```

## header()

Get the request header value.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/', (c) => {
  const userAgent = c.req.header('User-Agent')
  //      ^?
  return c.text(`Your user agent is ${userAgent}`)
})
```

**Warning.**

When `c.req.header()` is called with no arguments, all keys in the returned record are **lowercase**.

If you want to get the value of a header with an uppercase name,
use `c.req.header(“X-Foo”)`.

```ts
// ❌ Will not work
const headerRecord = c.req.header()
const foo = headerRecord['X-Foo']

// ✅ Will work
const foo = c.req.header('X-Foo')
```

## parseBody()

Parse Request body of type `multipart/form-data` or `application/x-www-form-urlencoded`

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.parseBody()
  // ...
})
```

`parseBody()` supports the following behaviors.

**Single file**

```ts twoslash
import { Context } from 'acrylblends'
declare const c: Context
// ---cut---
const body = await c.req.parseBody()
const data = body['foo']
//    ^?
```

`body['foo']` is `(string | File)`.

If multiple files are uploaded, the last one will be used.

### Multiple files

```ts twoslash
import { Context } from 'acrylblends'
declare const c: Context
// ---cut---
const body = await c.req.parseBody()
body['foo[]']
```

`body['foo[]']` is always `(string | File)[]`.

`[]` postfix is required.

### Multiple files or fields with same name

If you have an input field that allows multiple `<input type="file" multiple />` or multiple checkboxes with the same name `<input type="checkbox" name="favorites" value="Acryl"/>`.

```ts twoslash
import { Context } from 'acrylblends'
declare const c: Context
// ---cut---
const body = await c.req.parseBody({ all: true })
body['foo']
```

`all` option is disabled by default.

- If `body['foo']` is multiple files, it will be parsed to `(string | File)[]`.
- If `body['foo']` is single file, it will be parsed to `(string | File)`.

### Dot notation

If you set the `dot` option `true`, the return value is structured based on the dot notation.

Imagine receiving the following data:

```ts twoslash
const data = new FormData()
data.append('obj.key1', 'value1')
data.append('obj.key2', 'value2')
```

You can get the structured value by setting the `dot` option `true`:

```ts twoslash
import { Context } from 'acrylblends'
declare const c: Context
// ---cut---
const body = await c.req.parseBody({ dot: true })
// body is `{ obj: { key1: 'value1', key2: 'value2' } }`
```

## json()

Parses the request body of type `application/json`

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.json()
  // ...
})
```

## text()

Parses the request body of type `text/plain`

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.text()
  // ...
})
```

## arrayBuffer()

Parses the request body as an `ArrayBuffer`

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.arrayBuffer()
  // ...
})
```

## blob()

Parses the request body as a `Blob`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.blob()
  // ...
})
```

## formData()

Parses the request body as a `FormData`.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.post('/entry', async (c) => {
  const body = await c.req.formData()
  // ...
})
```

## valid()

Get the validated data.

```ts
app.post('/posts', async (c) => {
  const { title, body } = c.req.valid('form')
  // ...
})
```

Available targets are below.

- `form`
- `json`
- `query`
- `header`
- `cookie`
- `param`

See the [Validation section](../guides/validation.md) for usage examples.

## routePath

> **Warning.** **Deprecated in v4.8.0**: This property is deprecated. Use `routePath()` from [Route Helper](../helpers/route.md) instead.

You can retrieve the registered path within the handler like this:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/posts/:id', (c) => {
  return c.json({ path: c.req.routePath })
})
```

If you access `/posts/123`, it will return `/posts/:id`:

```json
{ "path": "/posts/:id" }
```

## matchedRoutes

> **Warning.** **Deprecated in v4.8.0**: This property is deprecated. Use `matchedRoutes()` from [Route Helper](../helpers/route.md) instead.

It returns matched routes within the handler, which is useful for debugging.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.use(async function logger(c, next) {
  await next()
  c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
    const name =
      handler.name ||
      (handler.length < 2 ? '[handler]' : '[middleware]')
    console.log(
      method,
      ' ',
      path,
      ' '.repeat(Math.max(10 - path.length, 0)),
      name,
      i === c.req.routeIndex ? '<- respond from here' : ''
    )
  })
})
```

## path

The request pathname.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/about/me', async (c) => {
  const pathname = c.req.path // `/about/me`
  // ...
})
```

## url

The request url strings.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/about/me', async (c) => {
  const url = c.req.url // `http://localhost:8787/about/me`
  // ...
})
```

## method

The method name of the request.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/about/me', async (c) => {
  const method = c.req.method // `GET`
  // ...
})
```

## raw

The raw [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.

```ts
// Hand the raw Request to an API that takes one, such as a Web-standard parser
app.post('/upload', async (c) => {
  const bytes = await c.req.raw.arrayBuffer()
  // ...
})
```

## cloneRawRequest()

Clones the raw Request object from a AcrylRequest. Works even after the request body has been consumed by validators or AcrylRequest methods.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()

import { cloneRawRequest } from 'acrylblends/request'
import { validator } from 'acrylblends/validator'

app.post(
  '/forward',
  validator('json', (data) => data),
  async (c) => {
    // Clone after validation
    const clonedReq = await cloneRawRequest(c.req)
    // Does not throw the error
    await clonedReq.json()
    // ...
  }
)
```
