# Bring your own tool: a provider of a port

Every choice in an app is a plugin behind a port, and what the app starts with is only a fallback. Any outside npm tool (a database, a store, a renderer, an auth library) joins the
app as another **provider** of the same port: a plugin that implements the port's interface on top of the tool and provides the service by its name. The code that uses the port
does not change. The port's **conformance suite** decides whether your provider is accepted, whoever wrote it. And because Cordis finds services by name, the app can swap the
provider **while it runs**: the plugins that use the port wait, and carry on when the new provider arrives. A person does it, or an agent working in the app folder, through the door.

This page does it once, from start to end, with a real tool: [lowdb](https://github.com/typicode/lowdb), a small JSON-file database, becomes a provider of the `kv` port ([Data](data.md#a-tiny-app-kv)).
Every step runs as written: the code on this page is extracted and run against a fresh app by `scripts/verify-byo-tool.mjs`.

You need an app with the `extensions` plugin, which installs plugins while the app runs: `npx acrylblends init my-app --template agent`, then `cd my-app` and `npm install`.

## 1. Bring the port, its suite and a way to run it

```sh
npx acrylblends add kv --suite
npm install
```

`add kv` copies the port (`plugins/acryl-kv`) and the JSON-file provider (`plugins/acryl-kv-json`) and gives your plugins the names `#acryl-kv` and `#acryl-kv-json` (entries in `package.json` "imports").
`--suite` also copies the port's conformance suite (`#acryl-kv/conformance`) and adds `vitest`, which runs it. The same works for the `db` port: `npx acrylblends add db --suite`.

## 2. Install the tool

```sh
npm install lowdb
```

## 3. Write the provider

A provider is a folder in `plugins/` with an `index.ts` that exports `name`, and `apply(ctx)` which provides the service. Keep the tool behind a plain function that returns the port's interface (`openKv`
here), so tests and plain code use it without Cordis, and let `apply` be a thin wrapper that provides it for as long as the plugin runs.

The port gives you the checks every provider must make alike (`checkKey`, `encodeValue`, `decodeValue`, `runChange`, `compareKeys`), so a bad call fails the same way on a file, on SQL and on your tool.

```ts no-check
// plugins/kv-lowdb/index.ts
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { checkKey, compareKeys, decodeValue, encodeValue, KV_SERVICE, runChange } from '#acryl-kv'
import type { Kv, KvOpened } from '#acryl-kv'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

/** The kv port on lowdb: one JSON file, written atomically by lowdb after every change. */
export async function openKv({ path }: { path: string }): Promise<KvOpened> {
  const db = new Low<Record<string, unknown>>(new JSONFile(path), {})
  await db.read()
  // One call at a time, in order: that is what makes `update` atomic and lets `close` wait for the writes in flight.
  let queue: Promise<unknown> = Promise.resolve()
  let closed = false
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new Error('the kv store is closed'))
    const result = queue.then(work)
    queue = result.catch(() => {})
    return result
  }
  // A copy of the stored value, so changing what `get` returned changes nothing stored.
  const copy = (key: string): unknown =>
    key in db.data ? decodeValue(encodeValue(db.data[key])) : undefined
  const kv: Kv = {
    get: <T>(key: string) =>
      run(async () => {
        checkKey(key)
        return copy(key) as T | undefined
      }),
    set: (key, value) =>
      run(async () => {
        checkKey(key)
        db.data[key] = decodeValue(encodeValue(value))
        await db.write()
      }),
    update: <T>(key: string, change: (current: T | undefined) => T) =>
      run(async () => {
        checkKey(key)
        const next = runChange(change, copy(key) as T | undefined)
        db.data[key] = decodeValue(encodeValue(next))
        await db.write()
        return copy(key) as T
      }),
    delete: (key) =>
      run(async () => {
        checkKey(key)
        delete db.data[key]
        await db.write()
      }),
    list: (prefix = '') =>
      run(async () =>
        Object.keys(db.data)
          .filter((key) => key.startsWith(prefix))
          .sort(compareKeys),
      ),
  }
  return {
    kv,
    async close() {
      closed = true
      await queue
    },
  }
}

export const name = 'kv-lowdb'

/** As a plugin: provide `kv` for as long as the plugin runs; the store closes after `kv` is withdrawn. */
export async function apply(ctx: Context, config: { path?: string } = {}): Promise<void> {
  const file = config.path ?? join(ctx.appInstance.home, 'kv-lowdb.json')
  await ctx.effect(async function* () {
    const opened = await openKv({ path: file })
    yield () => opened.close()
    yield ctx.reflect.provide(KV_SERVICE, opened.kv)
  }, `kv-lowdb: ${file}`)
}
```

(A block whose first line is a path comment is the file of that name.)

## 4. Pass the suite

The suite is the contract: it runs the same cases against every provider. A test gives it a fresh store for each case and a way to reopen the same storage.

```ts no-check
// test/kv-lowdb.spec.ts
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { describeKvConformance, type KvUnderTest } from '#acryl-kv/conformance'
import { openKv } from '../plugins/kv-lowdb/index.ts'

const underTest = async (path: string): Promise<KvUnderTest> => {
  const opened = await openKv({ path })
  return {
    kv: opened.kv,
    close: opened.close,
    reopen: async () => {
      await opened.close()
      return underTest(path)
    },
  }
}

// A fresh file per case, in a folder of the project (a sandboxed agent may not write to the system temp folder).
describeKvConformance('kv-lowdb', async () => {
  await mkdir('.acrylblends', { recursive: true })
  return underTest(join(await mkdtemp(join('.acrylblends', 'kv-lowdb-')), 'kv.json'))
})
```

```sh
npx vitest run test/kv-lowdb.spec.ts
```

All the cases must pass. A failure names the rule that broke (`counts fifty concurrent updates to exactly fifty`, `keeps what was written across close and reopen`, ...): fix the provider, not the test.

## 5. Make the default swappable, and swap

A provider that the app's code mounts at start (a row of `blend.yaml`) is fixed until the next start. To swap while the app runs, install both the default and yours as plugins of the app. A one-line plugin
names the default:

```ts no-check
// plugins/kv/index.ts
export { apply, Config } from '#acryl-kv-json'
export const name = 'kv'
```

Start the app and open it in a browser (`npm run dev`). The door is the command `.acryl/bin/acryl` in the app folder:

```sh
.acryl/bin/acryl plugin add plugins/kv
```

Any plugin that declares `inject: ['kv']` now has a store. This one counts visits:

```ts no-check
// plugins/visits/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from '#acryl-kv'

export const name = 'visits'
export const inject = ['router', 'kv']

/** GET /visits counts the visits in the kv store, whichever provider holds it. */
export function apply(ctx: Context): void {
  ctx.router.route(
    '/',
    new Acryl().get('/visits', async (c) =>
      c.json({ visits: await ctx.kv.update<number>('visits', (n) => (n ?? 0) + 1) }),
    ),
  )
}
```

```sh
.acryl/bin/acryl plugin add plugins/visits
curl <the address npm run dev printed>/visits       # {"visits":1}, then 2, then 3
```

Now swap. Two providers of one service cannot run together (the second is refused and nothing changes), so take the default out and put yours in:

```sh
.acryl/bin/acryl plugin remove kv
.acryl/bin/acryl plugin list            # visits: pending, missing kv
.acryl/bin/acryl plugin add plugins/kv-lowdb
curl <the address>/visits       # {"visits":1}: served again, by the same process
```

`visits` was never edited. While no provider existed its route was gone and its state was `pending`; the moment `kv-lowdb` provided `kv` it started again. The process did not restart, and the swap survives a
restart: the app remembers what was installed.

## What to know

- **Data does not move by itself.** The new store starts empty (the visits counted from 1 again). To carry it over, copy before you swap, in a script or a plugin: `copyKv(source, target)` from `#acryl-kv` copies one store into another.
- **A failed install changes nothing.** A provider that throws on start, or that cannot import something, is refused and the previous state stays. To go back: `plugin remove kv-lowdb`, then `plugin add plugins/kv`.
- **The suite checks the port, not your tool.** It cannot know that lowdb loses a write on a power cut. Read what the tool promises about durability before you trust it with more than a demo.
- **Other ports and tools work the same way.** `db`: `npx acrylblends add db --suite`, wrap a driver or an ORM behind `Db`, pass `describeDbConformance`. Keep the opener rule ([Data](data.md#why-the-database-is-opened-in-one-place)): only the file that mounts the provider imports the tool.
- **An agent can do all of it.** Give a coding agent in the app folder the page and one line: "wrap `<package>` as a provider of the `kv` port, pass its suite, and swap it in through the door". `AGENTS.md` in the app names the door.
