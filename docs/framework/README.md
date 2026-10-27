# Acryl

Acryl is a small web framework built on Web Standards. You write handlers over the standard `Request` and `Response`, and the same application runs on Node.js (and, experimentally, Bun), and inside a Cordis app as a plugin that an agent can extend while it runs.

```ts twoslash
import { Acryl } from 'acrylblends'
const app = new Acryl()

app.get('/', (c) => c.text('Acryl!'))

export default app
```

## Quick Start

```sh
npm create acrylblends@latest my-app
```

Other package managers work the same way: `pnpm create acrylblends@latest`, `yarn create acrylblends`, `bun create acrylblends@latest`.
Every template is a Cordis app (`blend.yaml`, plugins in `plugins/`). The starter asks which one you want (`nodejs`, `notes`, `chat`, or `acryl-app`, with an agent), and `npm create acrylblends@latest my-app notes` names it directly. See [Getting started](getting-started/basic.md).

## What is in the box

- **Routing** with several routers behind one API: `RegExpRouter`, `TrieRouter`, `SmartRouter` (the default, which chooses between them), `LinearRouter` and `PatternRouter`.
  See [Routers](concepts/routers.md) and [Routing](api/routing.md).
- **Web Standards only.** Handlers receive a `Context` over `Request` and return `Response`, with no runtime-specific objects. See [Web Standards](concepts/web-standard.md).
- **Built-in middleware** for authentication, CORS, CSRF, compression, ETag, logging, request ids, secure headers, timeouts and more.
  See [Built-in middleware](middleware/builtin/basic-auth.md) and [Middleware](concepts/middleware.md).
- **Helpers** for cookies, streaming and server-sent events, content negotiation, HTML templates, WebSockets and testing. See [Helpers](guides/helpers.md).
- **Typed routes and a typed client.** Route types flow from the server to `acrylblends/client`. See [RPC](guides/rpc.md).
- **Data** through one small `db` interface: SQL with numbered migrations on SQLite; the same code runs on Postgres through an optional plugin. See [Data](guides/data.md).
- **Validation** with a validator function or any Standard Schema library. See [Validation](guides/validation.md).
- **A Cordis plugin around it.** A plugin mounts an app with `ctx.router.route`, the mount goes away when the plugin unloads, and a coding agent can write such plugins
  into a running app. See [Acryl in a Cordis app](cordis/acryl-in-a-cordis-app.md) and [Agents](agents/index.md).

## Runtimes

Verified: Node.js. Bun is experimental (its adapter is checked on Bun). Adapters for AWS Lambda, Lambda@Edge, Cloudflare Workers and Pages, Vercel, Netlify and Service Workers are part of the package, with a guide each on [Other runtimes](getting-started/other-runtimes.md); they are tested with the platforms' own events and have not been deployed by the ACRYL team.

## Not yet available

Some parts of the documented API surface are not part of the package yet, and their pages say so: the Vite plugin for static site generation, a registry of third-party middleware, and benchmark results.
They are enabled as they are built.

## Where to read next

| I want to | Read |
| --- | --- |
| Run something in five minutes | [Getting started](getting-started/basic.md) |
| Run the app as a desktop app | [Desktop](getting-started/desktop.md) |
| Run it on a server | [Deploy](getting-started/deploy.md) |
| Run it on a hosting platform | [Other runtimes](getting-started/other-runtimes.md): [AWS Lambda](getting-started/aws-lambda.md), [Cloudflare Workers](getting-started/cloudflare-workers.md), [Vercel](getting-started/vercel.md), [Netlify](getting-started/netlify.md) |
| Look up a call | [API](api/index.md), [Routing](api/routing.md), [Context](api/context.md), [Request](api/request.md), [API summary](api/summary.md) |
| Understand the design | [Concepts](concepts/motivation.md) |
| Copy a pattern | [Guides](guides/best-practices.md), [Validation](guides/validation.md), [Testing](guides/testing.md), [Data, migrations and choosing a store](guides/data.md), [Forms, sessions and a database](guides/forms-and-sessions.md), [Client components without a bundler](guides/client-modules.md), [Bring your own tool](guides/bring-your-own-tool.md) |
| Use Acryl inside a Cordis app | [Acryl in a Cordis app](cordis/acryl-in-a-cordis-app.md), [Plugin lifecycle](cordis/plugin-lifecycle.md), [Mounting](cordis/mounting.md) |
| Move from the 0.3 router calls | [Migration from 0.3](cordis/migration-from-0-3.md) |
| Move from the 0.4 names (`App`) | [Migration from 0.4](cordis/migration-from-0-4.md) |

The license of these pages and of the framework source they describe is in [LICENSE](LICENSE).

## TypeScript in a Cordis app

An app's `tsconfig.json` can extend `acryl-router/tsconfig.app.json` (ES2024 with the DOM types, strict). The DOM types are optional: every
entry point's types also stand with only `"lib": ["ES2024"]` and `"types": ["node"]`, the setting a Host-only plugin uses so browser globals
do not typecheck in server code (the router's `tests/no-dom` fixture checks this on every typecheck).
