# Vercel

Vercel runs a function that takes a `Request` and returns a `Response`, which is what `app.fetch` is. `handle(app)` from `acrylblends/vercel` is that function.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with a `Request`. It has not been deployed to Vercel by the ACRYL team.

## A function

Create `api/index.ts`:

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/vercel'

const app = new Acryl().basePath('/api')

app.get('/', (c) => c.text('Hello from Vercel'))
app.get('/hello', (c) => c.json({ hello: 'world' }))

export const GET = handle(app)
export const POST = handle(app)
```

Export one handler per HTTP method the app answers. Run it locally with `vercel dev`, and publish with `vercel deploy`.

## The client's address

The client's address comes from `getConnInfo` of `acrylblends/vercel`, which reads the `x-real-ip` header Vercel sets; see the [ConnInfo helper](../helpers/conninfo.md).
