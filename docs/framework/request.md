# Request

Handlers read input through `c.req`, a thin wrapper around the Web `Request`. The original is `c.req.raw`.

## Route parameters

```ts
app.get('/entry/:id', c => {
  const id = c.req.param('id')
  return c.json({ id })
})

app.get('/entry/:id/comment/:commentId', c => {
  const { id, commentId } = c.req.param()
  return c.json({ id, commentId })
})
```

Named reads keep route contracts visible; read the whole map only when a generic logger or adapter needs it.

## Query strings

```ts
const page = c.req.query('page')     // one value
const all = c.req.query()            // every parameter, first value of each
const tags = c.req.queries('tag')    // repeated values: ?tag=work&tag=home
```

Convert strings to numbers, booleans or dates at the application boundary and reject invalid values explicitly; a validator does both
(see [Validation](./validation.md)).

## Headers

```ts
const requestId = c.req.header('X-Request-Id')
const headers = c.req.header()        // every header, keys in lowercase
```

Header names are case-insensitive for a named read. With no argument the record's keys are lowercase, so `c.req.header()['X-Foo']` is
always undefined; read `c.req.header('X-Foo')` instead. Optional headers need a deliberate fallback; do not let a missing authentication
header silently become an anonymous request unless that is the declared behavior.

## Bodies

```ts
app.post('/entry', async c => {
  const body = await c.req.json()       // application/json
  return c.json({ received: body }, 201)
})

await c.req.text()
await c.req.arrayBuffer()
await c.req.blob()
await c.req.formData()
await c.req.parseBody()                 // multipart/form-data or application/x-www-form-urlencoded
```

The reads are cached, so a validator and the handler can both read the body. Read untrusted bodies behind `bodyLimit`, which refuses a body
over the limit with 413 while it streams instead of after buffering it.

### Forms and uploads

`parseBody()` returns `string | File` per field; the last one wins when a name repeats:

```ts
const body = await c.req.parseBody()
body['file']                                       // string | File
const many = await c.req.parseBody({ all: true })  // repeated names become arrays
many['files']                                      // (string | File)[] when several were sent
const nested = await c.req.parseBody({ dot: true }) // obj.key1 -> { obj: { key1 } }
```

A field named with a `[]` suffix (`files[]`) is always an array. Treat every uploaded file as untrusted: check its type, size and
destination, and never use a caller-provided filename as a filesystem path without normalizing it and confining it to the intended
directory.

## Validated input

`c.req.valid(target)` returns what a validator for `json`, `form`, `query`, `header`, `cookie` or `param` produced, typed by it. See
[Validation](./validation.md).

## Method, path and URL

```ts
c.req.method   // 'GET'
c.req.path     // '/about/me'
c.req.url      // 'http://127.0.0.1:3290/about/me'
```

Do not parse the URL by hand to recover route parameters or query values the router already exposes. `routePath(c)` and
`matchedRoutes(c)` from `acryl-router/helpers` give the registered path and the routes that matched.

## Raw Web Request

```ts
const raw = c.req.raw
const url = new URL(raw.url)
```

Use the raw object for standards-based libraries, streaming bodies and signatures over the exact payload. Use `c.req` for normal
application code.

## Request cancellation

`c.req.raw.signal` aborts when the client goes away, when the plugin serving the request unloads and when the router is
disposed. Work that ignores it can outlive the plugin that owns it; see [Context](./context.md#cancellation-and-background-work).
