# Dev Helper

> **Not yet available.** The dev helper (`acrylblends/dev`) is documented here so the page structure matches the rest of the framework, and is not part of acrylblends yet. The code on this page is not checked by the docs tests.


Dev Helper provides useful methods you can use in development.

```ts
import { Acryl } from 'acrylblends'
import { getRouterName, showRoutes } from 'acrylblends/dev'
```

## `getRouterName()`

You can get the name of the currently used router with `getRouterName()`.

```ts
const app = new Acryl()

// ...

console.log(getRouterName(app))
```

## `showRoutes()`

`showRoutes()` function displays the registered routes in your console.

Consider an application like the following:

```ts
const app = new Acryl().basePath('/v1')

app.get('/posts', (c) => {
  // ...
})

app.get('/posts/:id', (c) => {
  // ...
})

app.post('/posts', (c) => {
  // ...
})

showRoutes(app, {
  verbose: true,
})
```

When this application starts running, the routes will be shown in your console as follows:

```txt
GET   /v1/posts
GET   /v1/posts/:id
POST  /v1/posts
```

## Options

### *(optional)* verbose: `boolean`

When set to `true`, it displays verbose information.

### *(optional)* colorize: `boolean`

When set to `false`, the output will not be colored.
