<p align="center">
  <img src="https://acrylblends.github.io/logo/mark.png" alt="ACRYLBLENDS" width="120">
</p>

<h1 align="center">acrylblends</h1>

<p align="center"><strong>Acryl: a small web framework on Web Standards, and whole apps built from Cordis plugins.</strong><br>
One <code>Request</code> in, one <code>Response</code> out - routing, middleware, validation, a typed client and a Node.js server, with no
dependencies - and a composition of plugins that runs in a browser or a desktop window.</p>

<p align="center">
  <a href="https://github.com/acrylblends/acrylblends/blob/main/docs/framework/README.md">Documentation</a> ·
  <a href="https://github.com/acrylblends/acrylblends/blob/main/docs/framework/getting-started/basic.md">Getting started</a> ·
  <a href="https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/index.md">API</a> ·
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
- [Start an app in five minutes](#start-an-app-in-five-minutes)
- [Run it in a browser or in a desktop window](#run-it-in-a-browser-or-in-a-desktop-window)
- [Start from the registry](#start-from-the-registry)
- [Publish your app, or your own starter](#publish-your-app-or-your-own-starter)
- [Keep the framework current](#keep-the-framework-current)
- [Use it as a library](#use-it-as-a-library)
- [A first API](#a-first-api)
- [Middleware](#middleware)
- [Validation](#validation)
- [Typed client](#typed-client)
- [Testing](#testing)
- [Serving on Node.js](#serving-on-nodejs)
- [What is in the package](#what-is-in-the-package)
- [Upgrading from an older version](#upgrading-from-an-older-version)
- [The acrylblends command](#the-acrylblends-command)
- [Links](#links)
- [License](#license)

## Requirements

- **Node.js 22.19 or newer.** Node.js is the verified runtime, and it runs `.ts` files directly, so there is no build step.
- **Bun** runs the same app (`export default app`) and is experimental.
- `acrylblends` has no dependencies. Its types need only Node's types (`@types/node`), not the DOM library.

## Start an app in five minutes

```sh
npm create acrylblends@latest my-app
cd my-app
npm install
npm run dev
```

The starter asks which template you want; naming one skips the question (`npm create acrylblends@latest my-app notes`).

| Template | What you get |
| --- | --- |
| `blank` | the router, the Node server and one route: the smallest app |
| `nodejs` | a page rendered with JSX and a client component, without a bundler |
| `notes` | a multi-user notes app on the `db` port: sign-up, sessions, migrations, search, a typed client |
| `chat` | an answer streamed over server-sent events from an OpenAI-compatible API, history in SQLite |
| `todo` | a to-do list on the router and live state |
| `agent` | the blank app with an agent that writes and installs plugins into the running app |

Every template is a Cordis app: `blend.yaml` lists its plugins, `plugins/` holds them as code you own, and the starter also writes
`docs/framework` (the pages this README links to), `AGENTS.md`, `CLAUDE.md`, one skill for a coding agent, and its own tests. `npm run dev`
serves it and prints the URL, `npm test` runs the tests, `npm run check` type-checks.

Adding a capability is one command: `npx acrylblends add <plugin>` copies a library plugin and what it needs into `plugins/`, prints the row to
add to `blend.yaml`, and records what it copied so `acrylblends upgrade` can move it forward later. `npx acrylblends plugins` lists the library.

## Run it in a browser or in a desktop window

The same app runs both ways; the routes, the plugins and the data are the ones you already wrote.

- **Browser**: what you get. `npm run dev` (or `npm start`) serves it on a loopback port and prints the URL.
- **Desktop**: add the shell and run it as a window on the app's own server.

```sh
npx acrylblends init my-app --desktop            # create an app with the shell (--template picks the template)
# or, in an app you already have:
npx acrylblends add desktop
npm install                                      # the shell needs electron
npm run desktop                                  # an Electron window on the app's own server
```

Every Electron call lives in `plugins/desktop`, so the app's own code never imports it. See
[Desktop](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/getting-started/desktop.md).

## Start from the registry

The registry is a set of starting points people published, browsable at [acrylblends.github.io/blends](https://acrylblends.github.io/blends)
and readable by any tool as plain JSON at <https://acrylblends.github.io/registry/index.json>. Each entry says which runtime it is for. An
`acrylblends` starter is a whole app, and one command makes it from npm alone:

```sh
npm create acrylblends@latest my-notes -- --from acrylblends.notes-desktop     # npm needs the -- before the options
cd my-notes
npm install
npm run dev
```

The other starters in the registry (`acryl.gtd`, `acryl.blank`, ...) are for the ACRYL app: `create-acrylblends` refuses them with a line that
says so. A repository with an `acryl.template.json` works the same way (`-- --from github:you/starter`), and a team's own registry is the same
layout in its own repository (`-- --from you.thing --registry github:you/registry`).

## Publish your app, or your own starter

**Your app** belongs to you and lives in your repository: `npm run save` commits it and pushes to its remote. It refuses a file that looks like
a secret, and refuses to push a private app to a public remote.

Before an app goes on a server: with `NODE_ENV=production` the door, the agent panel and the PTY driver start nothing, the `agent` template leaves its agent, builder and extensions rows out
(`ACRYL_PRODUCTION_KEEP` names the ones to keep, with a warning), and the `chat` template is closed until it has a `CHAT_ACCESS_TOKEN`
- see [What runs in production](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/production.md).

**A starter** other people can pull is a pull request to the registry repository: add `registry/blends/<id>/` with your app as it stands (without `node_modules/`
and `dist/`), its `blend.yaml` made public (`id`, a licence, a category and a one-line description) and an `acryl.template.json`, which is what marks it as an
app for acrylblends. CI validates every entry, makes the app with `create-acrylblends`, and fails when `index.json` is stale, so what the site lists is what
passed. The layout, and how to keep a starter private without a registry at all, is in
[the registry README](https://github.com/acrylblends/acrylblends.github.io/tree/main/registry).

## Keep the framework current

An app carries its framework plugins as source, so a new release moves them in place and leaves your own code alone:

```sh
npx acrylblends@latest upgrade --dry-run   # the plan: what would be replaced
npx acrylblends@latest upgrade             # an edited file stops it with the diff, unless --force
```

Write `@latest`: a bare `npx acrylblends upgrade` runs the copy the app has installed, and an app made before 1.0 has an old one with no `upgrade` verb (it prints its help and exits 0, so it looks as if it worked, or answers "unknown command" and exits 2).

## Use it as a library

An Acryl app is also a plain function from `Request` to `Response`, which needs no scaffold. Create a folder and install the package:

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

For Bun, `bun run index.ts` serves the same `export default app`. The same app mounts inside a Cordis plugin with
`ctx.router.route(prefix, app)`, which is how a generated app is put together: see
[Acryl in a Cordis app](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/cordis/acryl-in-a-cordis-app.md).

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

Read more: [Routing](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/routing.md),
[Context](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/context.md),
[Request](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/request.md),
[Exceptions](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/exception.md).

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
[Middleware](https://github.com/acrylblends/acrylblends/tree/main/docs/framework/middleware/builtin). To write your own, see the
[middleware guide](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/middleware.md).

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
ArkType and others). See the [validation guide](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/validation.md).

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

See [RPC](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/rpc.md).

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
[testing guide](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/testing.md).

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

See [Node.js](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/getting-started/nodejs.md).

## What is in the package

| Import | What |
| --- | --- |
| `acrylblends` | `Acryl`, `Context`, `AcrylRequest`, and the types |
| `acrylblends/<middleware>` | each built-in middleware, for example `acrylblends/cors` |
| `acrylblends/validator`, `acrylblends/schema-validator` | request validation |
| `acrylblends/client`, `acrylblends/testing` | the typed client and its in-process test version |
| `acrylblends/accepts`, `adapter`, `cookie`, `factory`, `html`, `route`, `streaming`, `ws`, `conninfo` | helpers ([helpers docs](https://github.com/acrylblends/acrylblends/tree/main/docs/framework/helpers)) |
| `acrylblends/http-exception` | `HTTPException` |
| `acrylblends/router/*` | the routers: `reg-exp-router`, `smart-router`, `trie-router`, `pattern-router`, `linear-router` ([routers](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/concepts/routers.md)) |
| `acrylblends/tiny`, `acrylblends/quick` | the presets: `Acryl` with another router (`PatternRouter`; `LinearRouter` and `TrieRouter`) ([presets](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/api/presets.md)) |
| `acrylblends/cache`, `acrylblends/mount` | the cache middleware and mounting another framework's fetch handler |
| `acrylblends/ssg` | static site generation: `toSSG` writes every route as a file ([SSG helper](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/helpers/ssg.md)) |
| `acrylblends/proxy`, `acrylblends/dev` | the proxy helper and the dev helpers (`showRoutes`, `inspectRoutes`, `getRouterName`) |
| `acrylblends/jsx` | JSX on the server: `jsxImportSource: 'acrylblends/jsx'`, `.tsx` files run on Node with `node --import acrylblends/node-server/register`, with `jsx/streaming`, and `acrylblends/jsx-renderer` for a layout behind `c.render` ([JSX guide](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/jsx.md)) |
| `acrylblends/jsx/dom` | JSX in the browser: hooks and `render` (needs the DOM library) ([client components](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/jsx-dom.md)); on Node, `clientModules` serves them to the browser without a bundler ([guide](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/guides/client-modules.md)) |
| `acrylblends/drivers` | the driver contract of the agent panel (`ChatDriver`, `TerminalDriver`, `Drivers`), for plugins that add an agent to the panel |
| `acrylblends/css` | CSS in JSX: `css`, `cx`, `keyframes`, `Style` ([CSS helper](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/helpers/css.md)) |
| `acrylblends/node-server` | `serve`, `createAdaptorServer`, `getRequestListener`; with `node-server/serve-static`, `node-server/conninfo`, and `node-server/register` (compiles `.tsx` with the app's `typescript`); `clientModules` and `buildClientModules` (client components without a bundler) |

Every subpath in the table is listed in the package's `exports` and is covered by semver from 1.0, except the ones marked experimental: `acrylblends/bun` and the door (`door/*`, `cordis/door`), which are development tools. The ported core's utilities (`utils/*`) and the base-class chunk are internal and not exported. Node.js is the runtime the package is verified on; the upstream's adapters for AWS Lambda, Lambda@Edge, Cloudflare, Vercel, Netlify and Service Workers are not part of the package ([Other runtimes](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/getting-started/other-runtimes.md)).

To extend the context's typed variables, augment the root module:

```ts
declare module 'acrylblends' {
  interface ContextVariableMap {
    user: string
  }
}
```

## Upgrading from an older version

An app made with any 0.9.1 or later release moves with `acrylblends upgrade` (above); its edited files are never replaced silently.

An app made by a published release from 0.7.8 on that still runs on the standalone layout also moves onto the ACRYL frame: `acrylblends upgrade` writes
`scripts/ide-host.mjs`, the generated overlay (`cordis.patch.yml` with the app's own rows and the frame rows), `cordis.yml`, `app/runtime.mjs` and
`frame/app-plugins.mjs` (with the entry isolate the app's services need), brings `src/app.ts`, `src/routes.ts` (or the template's route module) and
`src/frame.ts` up to date when they are still the released template's, copies the two host plugins (`acryl-web-server`, `acryl-page`), and points
`npm run dev` at the frame; `npm start` keeps the app's own server and URLs. A file you edited stops the upgrade (nothing is written) unless `--force`
backs it up first, and `blend.yaml` is never touched. The frame packages' specs come from `ACRYLBLENDS_FRAME_PACKAGES` while they are unpublished.
An app made before 0.7.8 cannot be carried forward: those releases wrote `src/main.ts` importing `./plugins/...` where the plugins are one folder up, so the
app could not start as scaffolded; the upgrade says so and asks for the `../plugins/...` paths (0.7.8 fixed them) before it writes the frame.

Code that imports the old names moves by hand: `App` and `AppRequest`, the 0.4 aliases of `Acryl` and `AcrylRequest`, are removed in 1.0, and
the scaffolding API that was the package root in 0.4 is now `acrylblends/cli`. See
[Migration to 1.0](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/cordis/migration-to-1-0.md) and
[Migration from 0.4](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/cordis/migration-from-0-4.md).

## The acrylblends command

The package also carries the `acrylblends` command. It scaffolds Cordis apps with ACRYL's plugins as code you own (instance, settings,
plugins installed while the app runs, an agent that builds plugins, durable tasks, the app as data in `blend.yaml`, a save that refuses
secrets):

```sh
npx acrylblends@latest init my-app -y
cd my-app && npm install && npm run dev      # the app in the ACRYL frame: chat, agents, branches, versions, Settings
npm run desktop                               # the same in its own window
```

`--bare` makes the plain app without the frame.

See the [ACRYLBLENDS documentation](https://github.com/acrylblends/acrylblends/blob/main/docs/README.md) and
[Acryl in a Cordis app](https://github.com/acrylblends/acrylblends/blob/main/docs/framework/cordis/acryl-in-a-cordis-app.md).

## Links

| | |
| --- | --- |
| Framework documentation | https://github.com/acrylblends/acrylblends/blob/main/docs/framework/README.md |
| ACRYLBLENDS website | https://acrylblends.github.io |
| ACRYL website | https://acryl.dev |
| This package's source and issues | https://github.com/acrylblends/acrylblends ([issues](https://github.com/acrylblends/acrylblends/issues)) |
| The framework's source | https://github.com/acryldev/acryl (`plugins/acryl-router`, `plugins/acryl-node-server`) |
| For coding agents | https://github.com/acrylblends/acrylblends/blob/main/docs/framework/agents/index.md |
| npm | https://www.npmjs.com/package/acrylblends |

## License

MIT. Copyright (c) 2026 WebBoxes s.r.o. The framework is ported from MIT-licensed open-source projects. Their notices are kept in the
package's `LICENSE` file.
