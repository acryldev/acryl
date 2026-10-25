# Cloudflare Workers

A Cloudflare Worker is a module that exports a `fetch` handler, which is what an Acryl app has: `export default app` is a Worker. The adapter `acrylblends/cloudflare-workers` adds the pieces that need Cloudflare: the client's address, WebSockets, and (deprecated) serving static files from Workers KV.

> **Status.** The adapter is the upstream adapter ported with its test suite, and a Worker with these routes (`export default app`, bindings from `vars`, `getConnInfo`, `waitUntil`) has been run in `workerd` with `wrangler dev --local`, which needs no Cloudflare account. The ACRYL team has not deployed to Cloudflare itself: run `wrangler dev` first.

## A Worker

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => c.text('Hello Cloudflare Workers!'))

export default app
```

With Wrangler: a `wrangler.jsonc` naming the entry file and a compatibility date (`"main": "src/index.ts"`, `"compatibility_date": "2026-01-01"`), then `npx wrangler dev` to run it locally and `npx wrangler deploy` to publish it.

## Bindings and the execution context

Environment variables, secrets, KV namespaces, D1 databases and R2 buckets arrive as `c.env`; the `ExecutionContext` is `c.executionCtx`:

```ts
import { Acryl } from 'acrylblends'

type Bindings = {
  MY_SECRET: string
}

const app = new Acryl<{ Bindings: Bindings }>()

app.get('/', (c) => {
  c.executionCtx.waitUntil(Promise.resolve()) // work that may finish after the response
  return c.text(c.env.MY_SECRET ? 'configured' : 'missing')
})

export default app
```

## The client's address

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/cloudflare-workers'

const app = new Acryl()

app.get('/ip', (c) => c.text(getConnInfo(c).remote.address ?? 'unknown'))

export default app
```

It reads the `cf-connecting-ip` header that Cloudflare sets. See the [ConnInfo helper](../helpers/conninfo.md).

## WebSockets

`upgradeWebSocket` from `acrylblends/cloudflare-workers` accepts the upgrade with Cloudflare's `WebSocketPair`. Cloudflare does not give an `onOpen` event. See the [WebSocket helper](../helpers/websocket.md).

## Static files

Prefer Cloudflare's static assets (the `assets` setting of Wrangler), which serve files before your code runs. `serveStatic` from `acrylblends/cloudflare-workers`, which reads files from Workers KV (`__STATIC_CONTENT`), is deprecated by Cloudflare's move to static assets and is kept for existing Workers Sites projects. Cloudflare Pages is the other option: see [Cloudflare Pages](cloudflare-pages.md).

## Service Worker syntax

A Worker written in the old non-module syntax (`addEventListener('fetch', ...)`) uses `fire` from `acrylblends/service-worker`: see [Service Worker](service-worker.md).
