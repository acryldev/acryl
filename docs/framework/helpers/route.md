# Route Helper

The Route Helper provides enhanced routing information for debugging and middleware development. It allows you to access detailed information about matched routes and the current route being processed.

## Import

```ts
import { Acryl } from 'acrylblends'
import {
  matchedRoutes,
  routePath,
  baseRoutePath,
  basePath,
} from 'acrylblends/route'
```

## Usage

### Basic route information

```ts
const app = new Acryl()

app.get('/posts/:id', (c) => {
  const currentPath = routePath(c) // '/posts/:id'
  const routes = matchedRoutes(c) // Array of matched routes

  return c.json({
    path: currentPath,
    totalRoutes: routes.length,
  })
})
```

### Working with sub-applications

```ts
const app = new Acryl()
const apiApp = new Acryl()

apiApp.get('/posts/:id', (c) => {
  return c.json({
    routePath: routePath(c), // '/posts/:id'
    baseRoutePath: baseRoutePath(c), // '/api'
    basePath: basePath(c), // '/api' (with actual params)
  })
})

app.route('/api', apiApp)
```

## `matchedRoutes()`

Returns an array of all routes that matched the current request, including middleware.

```ts
app.all('/api/*', (c, next) => {
  console.log('API middleware')
  return next()
})

app.get('/api/users/:id', (c) => {
  const routes = matchedRoutes(c)
  // Returns: [
  //   { method: 'ALL', path: '/api/*', handler: [Function] },
  //   { method: 'GET', path: '/api/users/:id', handler: [Function] }
  // ]
  return c.json({ routes: routes.length })
})
```

## `routePath()`

Returns the route path pattern registered for the current handler.

```ts
app.get('/posts/:id', (c) => {
  console.log(routePath(c)) // '/posts/:id'
  return c.text('Post details')
})
```

### Using with index parameter

You can optionally pass an index parameter to get the route path at a specific position, similar to `Array.prototype.at()`.

```ts
app.all('/api/*', (c, next) => {
  return next()
})

app.get('/api/users/:id', (c) => {
  console.log(routePath(c, 0)) // '/api/*' (first matched route)
  console.log(routePath(c, -1)) // '/api/users/:id' (last matched route)
  return c.text('User details')
})
```

## `baseRoutePath()`

Returns the base path pattern of the current route as specified in routing.

```ts
const subApp = new Acryl()
subApp.get('/posts/:id', (c) => {
  return c.text(baseRoutePath(c)) // '/:sub'
})

app.route('/:sub', subApp)
```

### Using with index parameter

You can optionally pass an index parameter to get the base route path at a specific
position, similar to `Array.prototype.at()`.

```ts
app.all('/api/*', (c, next) => {
  return next()
})

const subApp = new Acryl()
subApp.get('/users/:id', (c) => {
  console.log(baseRoutePath(c, 0)) // '/' (first matched route)
  console.log(baseRoutePath(c, -1)) // '/api' (last matched route)
  return c.text('User details')
})

app.route('/api', subApp)
```

## `basePath()`

Returns the base path with embedded parameters from the actual request.

```ts
const subApp = new Acryl()
subApp.get('/posts/:id', (c) => {
  return c.text(basePath(c)) // '/api' (for request to '/api/posts/123')
})

app.route('/:sub', subApp)
```
