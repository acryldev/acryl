# Cloudflare Pages

Cloudflare Pages Functions run code next to a static site. `handle(app)` from `acrylblends/cloudflare-pages` turns an Acryl app into a Pages Function, and `handleMiddleware` turns a middleware into a Pages middleware.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with a Pages event context. It has not been deployed to Cloudflare by the ACRYL team. Cloudflare recommends Workers with static assets for new projects (see [Cloudflare Workers](cloudflare-workers.md)).

## A catch-all function

Put the file in `functions/[[route]].ts` so it answers every path that is not a static file:

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/cloudflare-pages'

const app = new Acryl().basePath('/api')

app.get('/hello', (c) => c.json({ message: 'Hello from Pages Functions' }))

export const onRequest = handle(app)
```

`basePath('/api')` is for a function at `functions/api/[[route]].ts`.

## The event context and the bindings

The Pages event context (`env`, `params`, `data`, `waitUntil`, `next`) is `c.env.eventContext`; the environment bindings are `c.env` as in Workers:

```ts
import { Acryl } from 'acrylblends'
import type { EventContext } from 'acrylblends/cloudflare-pages'

type Bindings = { MY_KV: unknown; eventContext: EventContext }

const app = new Acryl<{ Bindings: Bindings }>()

app.get('/params', (c) => c.json(c.env.eventContext.params))
```

## Middleware

```ts
import { handleMiddleware } from 'acrylblends/cloudflare-pages'

// functions/_middleware.ts
export const onRequest = handleMiddleware(async (c, next) => {
  await next()
  c.res.headers.set('x-checked', 'yes')
})
```

## Static files

In [advanced mode](https://developers.cloudflare.com/pages/platform/functions/advanced-mode/) (a `_worker.js` that answers every request), `serveStatic()` from `acrylblends/cloudflare-pages` answers a request from the Pages `ASSETS` binding and falls through to the app's not-found handler when there is no such file. The client's address is available through the [ConnInfo helper](../helpers/conninfo.md).
