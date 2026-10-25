<p align="center">
  <img src="https://raw.githubusercontent.com/acrylblends/acrylblends/main/docs/assets/acrylblends-logo.png" alt="ACRYLBLENDS" width="120">
</p>

<h1 align="center">acrylblends</h1>

<p align="center"><strong>Acryl, a small web framework on Web Standards, for Node.js.</strong><br>
One <code>Request</code> in, one <code>Response</code> out: routing, middleware, validation, a typed client and a Node.js server, with no dependencies.</p>

<p align="center">
  <a href="https://github.com/acryldev/acryl/blob/main/docs/framework/README.md">Documentation</a> ·
  <a href="https://github.com/acryldev/acryl/blob/main/docs/framework/getting-started/basic.md">Getting started</a> ·
  <a href="https://github.com/acryldev/acryl/blob/main/docs/framework/api/index.md">API</a> ·
  <a href="https://acrylblends.github.io">acrylblends.github.io</a> ·
  <a href="https://acryl.dev">acryl.dev</a> ·
  <a href="https://github.com/acrylblends/acrylblends">GitHub</a>
</p>

---

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Acryl!'))

export default app
```

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Start from a template](#start-from-a-template)
- [A first API](#a-first-api)
- [Middleware](#middleware)
- [Validation](#validation)
- [Typed client](#typed-client)
- [Testing](#testing)
- [Serving on Node.js](#serving-on-nodejs)
- [What is in the package](#what-is-in-the-package)
- [Upgrading from 0.4](#upgrading-from-04)
- [The acrylblends command](#the-acrylblends-command)
- [Links](#links)
- [License](#license)

## Requirements

- **Node.js 22.19 or newer.** Node.js is the verified runtime, and it runs `.ts` files directly, so there is no build step.
- **Bun** runs the same app (`export default app`) and is experimental.
- `acrylblends` has no dependencies. Its types need only Node's types (`@types/node`), not the DOM library.

## Quick start

Create a folder and install the package:

```sh
mkdir my-app && cd my-app
npm init -y
npm pkg set type=module
npm install acrylblends
```

Write the app in `index.ts`:

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => c.text('Acryl!'))

export default app
```

Serve it on Node.js with the adapter in `server.ts`:

```ts
import { serve } from 'acrylblends/node-server'
import app from './index.ts'

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`)
})
```

Run it and open http://localhost:3000:

```sh
node server.ts
```

For Bun, `bun run index.ts` serves the same `export default app`.

## Start from a template

`create-acrylblends` creates a ready project with `dev`, `test` and `start` scripts:

```sh
npm create acrylblends@latest my-app
cd my-app
npm install
npm run dev
```

The `nodejs` template is a minimal Acryl app. `bun` is the same for Bun (experimental). `acryl-app` is a Cordis app built from plugins,
with an agent that can extend it while it runs. See the
[create-acrylblends guide](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/create-acrylblends.md).

## A first API

```ts
import { Acryl } from 'acrylblends'
import { HTTPException } from 'acrylblends/http-exception'

type Book = { id: string, title: string }
const books = new Map<string, Book>()

const app = new Acryl()

app.get('/api/books', (c) => c.json([...books.values()]))

app.get('/api/books/:id', (c) => {
  const book = books.get(c.req.param('id'))
  if (book === undefined) throw new HTTPException(404, { message: 'no such book' })
  return c.json(book)
})

app.post('/api/books', async (c) => {
  const { title } = await c.req.json<{ title: string }>()
  const book = { id: crypto.randomUUID(), title }
  books.set(book.id, book)
  return c.json(book, 201)
})

app.notFound((c) => c.json({ error: 'not found' }, 404))
app.onError((error, c) => error instanceof HTTPException ? error.getResponse() : c.json({ error: 'internal error' }, 500))

export default app
```

Read more: [Routing](https://github.com/acryldev/acryl/blob/main/docs/framework/api/routing.md),
[Context](https://github.com/acryldev/acryl/blob/main/docs/framework/api/context.md),
[Request](https://github.com/acryldev/acryl/blob/main/docs/framework/api/request.md),
[Exceptions](https://github.com/acryldev/acryl/blob/main/docs/framework/api/exception.md).

## Middleware

Each built-in middleware has its own subpath:

```ts
import { Acryl } from 'acrylblends'
import { cors } from 'acrylblends/cors'
import { logger } from 'acrylblends/logger'
import { secureHeaders } from 'acrylblends/secure-headers'
import { bearerAuth } from 'acrylblends/bearer-auth'

const app = new Acryl()

app.use(logger())
app.use(secureHeaders())
app.use('/api/*', cors())
app.use('/admin/*', bearerAuth({ token: process.env.ADMIN_TOKEN ?? '' }))
```

Built in: `basic-auth`, `bearer-auth`, `body-limit`, `combine`, `compress`, `context-storage`, `cors`, `csrf`, `etag`, `ip-restriction`,
`jwk`, `jwt`, `language`, `logger`, `method-not-allowed`, `method-override`, `powered-by`, `pretty-json`, `request-id`, `secure-headers`,
`serve-static`, `timeout`, `timing`, `trailing-slash`, plus ACRYL's `loopback-only`. Each one is documented under
[Middleware](https://github.com/acryldev/acryl/tree/main/docs/framework/middleware/builtin). To write your own, see the
[middleware guide](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/middleware.md).

## Validation

`acrylblends/validator` validates any part of a request: `json`, `form`, `query`, `param`, `header`, `cookie`. The validated value is typed
in the handler:

```ts
import { Acryl } from 'acrylblends'
import { validator } from 'acrylblends/validator'

const app = new Acryl()

app.post(
  '/api/books',
  validator('json', (value, c) => {
    const title = (value as { title?: unknown }).title
    if (typeof title !== 'string' || title === '') return c.json({ error: 'title is required' }, 400)
    return { title }
  }),
  (c) => c.json({ title: c.req.valid('json').title }, 201),
)
```

`acrylblends/schema-validator` drives the same validator with any [Standard Schema](https://standardschema.dev) library (Zod, Valibot,
ArkType and others). See the [validation guide](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/validation.md).

## Typed client

Export the app's type, and `acrylblends/client` calls its routes with typed paths, inputs and answers:

```ts
// api.ts
import { Acryl } from 'acrylblends'

const app = new Acryl().get('/api/hello', (c) => c.json({ message: 'Acryl!' }))
export type AppType = typeof app
export default app
```

```ts
// client.ts
import { hc } from 'acrylblends/client'
import type { AppType } from './api.ts'

const client = hc<AppType>('http://localhost:3000')
const answer = await client.api.hello.$get()
console.log((await answer.json()).message)
```

See [RPC](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/rpc.md).

## Testing

`app.request()` answers a request in process, with no server and no port, so tests need nothing else running:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import app from './index.ts'

test('GET / says hello', async () => {
  const response = await app.request('/')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Acryl!')
})
```

Run it with `node --test`. `acrylblends/testing` adds `testClient`, the typed client over `app.request()`. See the
[testing guide](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/testing.md).

## Serving on Node.js

`acrylblends/node-server` serves any Acryl app on Node's `http` module (or `http2` and `https` with `createServer`), streams bodies, aborts
`c.req.raw.signal` when the client goes away, and serves files:

```ts
import { Acryl } from 'acrylblends'
import { serve } from 'acrylblends/node-server'
import { serveStatic } from 'acrylblends/node-server/serve-static'
import { getConnInfo } from 'acrylblends/node-server/conninfo'

const app = new Acryl()
app.use('/static/*', serveStatic({ root: './' }))
app.get('/ip', (c) => c.text(getConnInfo(c).remote.address ?? 'unknown'))

const server = serve({ fetch: app.fetch, port: 3000, hostname: '127.0.0.1' })
process.on('SIGTERM', () => { server.close() })
```

See [Node.js](https://github.com/acryldev/acryl/blob/main/docs/framework/getting-started/nodejs.md).

## What is in the package

| Import | What |
| --- | --- |
| `acrylblends` | `Acryl`, `Context`, `AcrylRequest`, and the types |
| `acrylblends/<middleware>` | each built-in middleware, for example `acrylblends/cors` |
| `acrylblends/validator`, `acrylblends/schema-validator` | request validation |
| `acrylblends/client`, `acrylblends/testing` | the typed client and its in-process test version |
| `acrylblends/accepts`, `adapter`, `cookie`, `factory`, `html`, `route`, `streaming`, `ws`, `conninfo` | helpers ([helpers docs](https://github.com/acryldev/acryl/tree/main/docs/framework/helpers)) |
| `acrylblends/http-exception` | `HTTPException` |
| `acrylblends/router/*` | the routers: `reg-exp-router`, `smart-router`, `trie-router`, `pattern-router`, `linear-router` ([routers](https://github.com/acryldev/acryl/blob/main/docs/framework/concepts/routers.md)) |
| `acrylblends/utils/*` | the utilities the framework is built from |
| `acrylblends/tiny`, `acrylblends/quick` | the presets: `Acryl` with another router (`PatternRouter`; `LinearRouter` and `TrieRouter`) ([presets](https://github.com/acryldev/acryl/blob/main/docs/framework/api/presets.md)) |
| `acrylblends/cache`, `acrylblends/mount` | the cache middleware and mounting another framework's fetch handler |
| `acrylblends/proxy`, `acrylblends/dev` | the proxy helper and the dev helpers (`showRoutes`, `inspectRoutes`, `getRouterName`) |
| `acrylblends/jsx` | JSX on the server: `jsxImportSource: 'acrylblends/jsx'`, with `jsx/streaming` ([JSX guide](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/jsx.md)) |
| `acrylblends/jsx/dom` | JSX in the browser: hooks and `render` (needs the DOM library) ([client components](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/jsx-dom.md)) |
| `acrylblends/css` | CSS in JSX: `css`, `cx`, `keyframes`, `Style` ([CSS helper](https://github.com/acryldev/acryl/blob/main/docs/framework/helpers/css.md)) |
| `acrylblends/node-server` | `serve`, `createAdaptorServer`, `getRequestListener`; with `node-server/serve-static` and `node-server/conninfo` |

Every subpath is listed in the package's `exports`. The JSX renderer middleware, SSG and other runtimes' adapters are being ported. The docs mark them "not yet available" until they ship
([FAQ](https://github.com/acryldev/acryl/blob/main/docs/framework/guides/faq.md)).

To extend the context's typed variables, augment the root module:

```ts
declare module 'acrylblends' {
  interface ContextVariableMap {
    user: string
  }
}
```

## Upgrading from 0.4

From 0.5 the package's root is the framework. `App` and `AppRequest`, the 0.4 names, still work as deprecated aliases of `Acryl` and
`AcrylRequest` for one release. The scaffolding API that was the root in 0.4 is now `acrylblends/cli`. See
[Migration from 0.4](https://github.com/acryldev/acryl/blob/main/docs/framework/cordis/migration-from-0-4.md).

## The acrylblends command

The package also carries the `acrylblends` command. It scaffolds Cordis apps with ACRYL's plugins as code you own (instance, settings,
plugins installed while the app runs, an agent that builds plugins, durable tasks, the app as data in `blend.yaml`, a save that refuses
secrets):

```sh
npx acrylblends init my-app --agent -y
cd my-app && npm install && npm run dev
```

See the [ACRYLBLENDS documentation](https://github.com/acrylblends/acrylblends/blob/main/docs/README.md) and
[Acryl in a Cordis app](https://github.com/acryldev/acryl/blob/main/docs/framework/cordis/acryl-in-a-cordis-app.md).

## Links

| | |
| --- | --- |
| Framework documentation | https://github.com/acryldev/acryl/blob/main/docs/framework/README.md |
| ACRYLBLENDS website | https://acrylblends.github.io |
| ACRYL website | https://acryl.dev |
| This package's source and issues | https://github.com/acrylblends/acrylblends ([issues](https://github.com/acrylblends/acrylblends/issues)) |
| The framework's source | https://github.com/acryldev/acryl (`plugins/acryl-router`, `plugins/acryl-node-server`) |
| For coding agents | https://github.com/acryldev/acryl/blob/main/docs/framework/agents/index.md |
| npm | https://www.npmjs.com/package/acrylblends |

## License

MIT. Copyright (c) 2026 WebBoxes s.r.o. The framework is ported from MIT-licensed open-source projects. Their notices are kept in the
package's `LICENSE` file.
