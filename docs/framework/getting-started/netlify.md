# Netlify

Netlify Functions (version 2) and Edge Functions take a `Request` and a context and return a `Response`. `handle(app)` from `acrylblends/netlify` is that function; the Netlify context is available to the app as `c.env.context`.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with a `Request`. It has not been deployed to Netlify by the ACRYL team.

## A function

`netlify/functions/api.ts`:

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/netlify'
import type { Context } from '@netlify/functions'

type Bindings = { context: Context }

const app = new Acryl<{ Bindings: Bindings }>().basePath('/.netlify/functions/api')

app.get('/hello', (c) => c.json({ hello: 'world', site: c.env.context.site.id }))

export default handle(app)
```

Run it locally with `netlify dev` and publish with `netlify deploy`. The client's address comes from `getConnInfo` of `acrylblends/netlify` (the Netlify context's `ip`); see the [ConnInfo helper](../helpers/conninfo.md).
