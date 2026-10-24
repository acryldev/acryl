# Routing

Routing of Acryl is flexible and intuitive.
Let's take a look.

## Basic

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
// HTTP Methods
app.get('/', (c) => c.text('GET /'))
app.post('/', (c) => c.text('POST /'))
app.put('/', (c) => c.text('PUT /'))
app.delete('/', (c) => c.text('DELETE /'))
app.query('/', (c) => c.text('QUERY /'))

// Wildcard
app.get('/wild/*/card', (c) => {
  return c.text('GET /wild/*/card')
})

// Any HTTP methods
app.all('/hello', (c) => c.text('Any Method /hello'))

// Custom HTTP method
app.on('PURGE', '/cache', (c) => c.text('PURGE Method /cache'))

// Multiple Method
app.on(['PUT', 'DELETE'], '/post', (c) =>
  c.text('PUT or DELETE /post')
)

// Multiple Paths
app.on('GET', ['/hello', '/ja/hello', '/en/hello'], (c) =>
  c.text('Hello')
)
```

## Path Parameter

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/user/:name', async (c) => {
  const name = c.req.param('name')
  //       ^?
  // ...
})
```

or all parameters at once:

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/posts/:id/comment/:comment_id', async (c) => {
  const { id, comment_id } = c.req.param()
  //       ^?
  // ...
})
```

## Optional Parameter

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
// Will match `/api/animal` and `/api/animal/:type`
app.get('/api/animal/:type?', (c) => c.text('Animal!'))
```

## Regexp

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/post/:date{[0-9]+}/:title{[a-z]+}', async (c) => {
  const { date, title } = c.req.param()
  //       ^?
  // ...
})
```

## Including slashes

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/posts/:filename{.+\\.png}', async (c) => {
  //...
})
```

## Chained route

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app
  .get('/endpoint', (c) => {
    return c.text('GET /endpoint')
  })
  .post((c) => {
    return c.text('POST /endpoint')
  })
  .delete((c) => {
    return c.text('DELETE /endpoint')
  })
```

## Grouping

You can group the routes with the Acryl instance and add them to the main app with the route method.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const book = new Acryl()

book.get('/', (c) => c.text('List Books')) // GET /book
book.get('/:id', (c) => {
  // GET /book/:id
  const id = c.req.param('id')
  return c.text('Get Book: ' + id)
})
book.post('/', (c) => c.text('Create Book')) // POST /book

const app = new Acryl()
app.route('/book', book)
```

## Grouping without changing base

You can also group multiple instances while keeping base.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const book = new Acryl()
book.get('/book', (c) => c.text('List Books')) // GET /book
book.post('/book', (c) => c.text('Create Book')) // POST /book

const user = new Acryl().basePath('/user')
user.get('/', (c) => c.text('List Users')) // GET /user
user.post('/', (c) => c.text('Create User')) // POST /user

const app = new Acryl()
app.route('/', book) // Handle /book
app.route('/', user) // Handle /user
```

## Base path

You can specify the base path.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const api = new Acryl().basePath('/api')
api.get('/book', (c) => c.text('List Books')) // GET /api/book
```

## Routing with hostname

It works fine if it includes a hostname.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const app = new Acryl({
  getPath: (req) => req.url.replace(/^https?:\/([^?]+).*$/, '$1'),
})

app.get('/www1.example.com/hello', (c) => c.text('hello www1'))
app.get('/www2.example.com/hello', (c) => c.text('hello www2'))
```

## Routing with `host` Header value

Acryl can handle the `host` header value if you set the `getPath()` function in the Acryl constructor.

```ts twoslash
import { Acryl } from 'acrylblends'
// ---cut---
const app = new Acryl({
  getPath: (req) =>
    '/' +
    req.headers.get('host') +
    req.url.replace(/^https?:\/\/[^/]+(\/[^?]*).*/, '$1'),
})

app.get('/www1.example.com/hello', (c) => c.text('hello www1'))

// A following request will match the route:
// new Request('http://www1.example.com/hello', {
//  headers: { host: 'www1.example.com' },
// })
```

By applying this, for example, you can change the routing by `User-Agent` header.

## Routing priority

Handlers or middleware will be executed in registration order.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/book/a', (c) => c.text('a')) // a
app.get('/book/:slug', (c) => c.text('common')) // common
```

```
GET /book/a ---> `a`
GET /book/b ---> `common`
```

When a handler is executed, the process will be stopped.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('*', (c) => c.text('common')) // common
app.get('/foo', (c) => c.text('foo')) // foo
```

```
GET /foo ---> `common` // foo will not be dispatched
```

If you have the middleware that you want to execute, write the code above the handler.

```ts twoslash
import { Acryl } from 'acrylblends'
import { logger } from 'acrylblends/logger'
const app = new Acryl()
// ---cut---
app.use(logger())
app.get('/foo', (c) => c.text('foo'))
```

If you want to have a "_fallback_" handler, write the code below the other handler.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
// ---cut---
app.get('/bar', (c) => c.text('bar')) // bar
app.get('*', (c) => c.text('fallback')) // fallback
```

```
GET /bar ---> `bar`
GET /foo ---> `fallback`
```

## Grouping ordering

Note that the mistake of grouping routings is hard to notice.
The `route()` function takes the stored routing from the second argument (such as `three` or `two`) and adds it to its own (`two` or `app`) routing.

```ts
three.get('/hi', (c) => c.text('hi'))
two.route('/three', three)
app.route('/two', two)

export default app
```

It will return 200 response.

```
GET /two/three/hi ---> `hi`
```

However, if they are in the wrong order, it will return a 404.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()
const two = new Acryl()
const three = new Acryl()
// ---cut---
three.get('/hi', (c) => c.text('hi'))
app.route('/two', two) // `two` does not have routes
two.route('/three', three)

export default app
```

```
GET /two/three/hi ---> 404 Not Found
```
