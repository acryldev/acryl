# Getting Started

Using Acryl is easy. You set up the project, write code, develop with a local server, and run it. The same application code works on every verified runtime, with a different
entry point for each. This page shows the basic usage.

## Starter

Starter templates are available for each runtime. Use the "create-acrylblends" command.

**npm**

```sh
npm create acrylblends@latest my-app
```

**yarn**

```sh
yarn create acrylblends my-app
```

**pnpm**

```sh
pnpm create acrylblends@latest my-app
```

**bun**

```sh
bun create acrylblends@latest my-app
```

You are asked which template you want:

```
? Which template do you want to use?
❯   nodejs
    bun (experimental)
    acryl-app
```

`nodejs` and `bun` (experimental) are a minimal Acryl application for that runtime. `acryl-app` is a Cordis app built from plugins, with an agent that can extend it while it
runs (see [Acryl in a Cordis app](../cordis/acryl-in-a-cordis-app.md)). Pass `--template` to skip the question, see [create-acrylblends](../guides/create-acrylblends.md).

The template is created in `my-app`: go to it, install the dependencies and start the local server.

```sh
cd my-app
npm install
npm run dev
```

## Hello World

Write your first application in `src/index.ts`. The example below is a starter Acryl application.

The `import` and the final `export default` are the same on every runtime; what differs is how the runtime starts the app (see [Node.js](nodejs.md) and [Bun](bun.md)).

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => {
  return c.text('Acryl!')
})

export default app
```

Start the development server and open the address it prints.

## Return JSON

Returning JSON is also easy. The following handles a GET request to `/api/hello` and returns an `application/json` response.

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/api/hello', (c) => {
  return c.json({
    ok: true,
    message: 'Acryl!',
  })
})
```

## Request and Response

Getting a path parameter, a URL query value, and adding a response header is written as follows.

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/posts/:id', (c) => {
  const page = c.req.query('page')
  const id = c.req.param('id')
  c.header('X-Message', 'Hi!')
  return c.text(`You want to see ${page} of ${id}`)
})
```

POST, PUT and DELETE are handled the same way as GET.

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.post('/posts', (c) => c.text('Created!', 201))
app.delete('/posts/:id', (c) => c.text(`${c.req.param('id')} is deleted!`))
```

## Return HTML

Write HTML with [the html helper](../helpers/html.md):

```ts twoslash
import { Acryl } from 'acrylblends'
import { html } from 'acrylblends/html'

const app = new Acryl()

app.get('/', (c) => {
  const name = 'Acryl'
  return c.html(html`<!doctype html><h1>Hello ${name}!</h1>`)
})
```

[JSX](../guides/jsx.md) is not yet available.

## Return raw Response

You can also return a raw Web Standard `Response`.

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', () => {
  return new Response('Good morning!')
})
```

## Using Middleware

Middleware can do the hard work for you. For example, add Basic Authentication.

```ts twoslash
import { Acryl } from 'acrylblends'
import { basicAuth } from 'acrylblends/basic-auth'

const app = new Acryl()

app.use(
  '/admin/*',
  basicAuth({
    username: 'admin',
    password: process.env.ADMIN_PASSWORD!,
  })
)

app.get('/admin', (c) => {
  return c.text('You are authorized!')
})
```

There are useful middleware included, such as Bearer and JWT authentication, CORS and ETag. See [Built-in middleware](../middleware/builtin/basic-auth.md).

## Testing

An app is a function from `Request` to `Response`, so a test needs no server:

```ts twoslash
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Acryl!'))

const response = await app.request('/')
console.log(response.status, await response.text())
```

See [Testing](../guides/testing.md).

## Next

- [Node.js](nodejs.md) and [Bun](bun.md) (experimental)
- [Desktop](desktop.md): the same app in an Electron window
- [Routing](../api/routing.md), [Context](../api/context.md) and [Request](../api/request.md)
- [Validation](../guides/validation.md)
