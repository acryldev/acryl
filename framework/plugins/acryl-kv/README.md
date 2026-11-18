# acryl-kv

The `kv` port: named JSON documents for an app too small for SQL, whichever provider serves it (`acryl-kv-json` for one file, `acryl-kv-db`
over the [`db` port](../acryl-db/README.md)). An app plugin declares `inject: ['kv']`, imports types from here, and never imports a provider.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-kv/cordis'

export const name = 'settings-app'
export const inject = ['kv']

export async function apply(ctx: Context) {
  await ctx.kv.set('theme', 'dark')
  const visits = await ctx.kv.update<number>('visits', (current) => (current ?? 0) + 1)
}
```

- `get(key)` resolves the value or `undefined`; `set(key, value)`; `delete(key)` (a missing key is not an error);
  `list(prefix?)` resolves the keys that start with the prefix, sorted by code point.
- `update(key, change)` is atomic: `change(current)` is **synchronous** (an `async` function is a type error and a returned promise is
  rejected), `current` is `undefined` for a missing key, and no other write to the key happens between the read and the write. A `change`
  that throws, or returns something that is not JSON, leaves the value as it was.
- Keys are non-empty strings. Values are JSON: `undefined`, functions, symbols, bigints and non-finite numbers are refused with a `TypeError`.
  A value read back is a copy.
- No `close`: the code that opened a store closes it.
- `copyKv(source, target, { overwrite?, prefix? })` copies every key from one store to another: the import when an app moves from a JSON file
  to SQL.

Plain code (no Cordis) opens a store with a provider's `openKv`; this package's root entry imports nothing from Cordis.

## Conformance

Every provider passes the same suite, from its own tests:

```ts
import { describeKvConformance } from 'acryl-kv/conformance'

describeKvConformance('my-provider', async () => {
  const opened = await openMyStore()
  return { kv: opened.kv, close: opened.close, reopen: async () => { await opened.close(); return openMyStore() } }
})
```

The suite uses Vitest (an optional peer dependency).
