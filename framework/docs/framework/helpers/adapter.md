# Adapter Helper

The Adapter Helper reads an app's environment the same way on every runtime it runs on.

## Import

```ts
import { Acryl } from 'acrylblends'
import { env, getRuntimeKey } from 'acrylblends/adapter'
```

## `env()`

The `env()` function returns the environment the host gives the app. On Node.js, the verified runtime, that is `process.env`; on Bun it is `Bun.env` (and `process.env`), and the two entries a `.env` file adds are there as well. A host that passes its own environment to `app.fetch(request, env)` gets that instead.

```ts
import { env } from 'acrylblends/adapter'

app.get('/env', (c) => {
  // NAME is process.env.NAME on Node.js and Bun
  const { NAME } = env<{ NAME: string }>(c)
  return c.text(NAME)
})
```

### Specify the runtime

`env()` reads the runtime itself. Pass the runtime key as the second argument when a host embeds the app and detects it differently, or in a test that fixes the key:

```ts
app.get('/env', (c) => {
  const { NAME } = env<{ NAME: string }>(c, 'node')
  return c.text(NAME)
})
```

## `getRuntimeKey()`

The `getRuntimeKey()` function returns the identifier of the current runtime.

```ts
app.get('/', (c) => {
  if (getRuntimeKey() === 'bun') {
    return c.text('You are on Bun')
  }
  return c.text(`You are on ${getRuntimeKey()}`)
})
```

### Available runtime keys

The keys follow [WinterCG's Runtime Keys proposal](https://runtime-keys.proposal.wintercg.org/):

- `node` - Node.js, the verified runtime
- `bun` - Bun, experimental
- `deno`, `workerd`, `edge-light`, `fastly` - keys the helper still recognizes for a host that embeds an app in that runtime; 1.0 ships no adapter for them (see [Other runtimes](../getting-started/other-runtimes.md))
- `other` - a runtime the helper does not recognize
