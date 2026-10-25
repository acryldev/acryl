# Client components without a bundler

A page can run [client components](jsx-dom.md) written in TypeScript and JSX with no bundler and no build configuration. `clientModules` from
`acrylblends/node-server` serves a folder of client modules to the browser: each `.tsx`, `.ts` or `.jsx` file is compiled when the browser asks
for it, with your app's own `typescript`, and the framework's browser imports are pointed at the browser builds the package ships. The page
needs one script tag.

It runs on Node, the runtime the framework targets. For a large client app with many npm packages, a bundler (Vite, esbuild) remains the
better tool; see [The `acrylblends/jsx/dom` runtime](jsx-dom.md#the-acrylblendsjsxdom-runtime).

## Set up

The routes, with the type the browser's typed client uses, in a file of their own (`app.ts`):

```ts
import { Acryl } from 'acrylblends'

export const app = new Acryl()
  .get('/', (c) =>
    c.html(
      '<!doctype html><div id="counter"></div><p id="greeting"></p>' +
        '<script type="module" src="/client/counter.tsx"></script>'
    )
  )
  .get('/api/hello', (c) => c.json({ hello: 'browser' }))

export type AppType = typeof app
```

The Node entry routes the client modules next to them (`site.ts`):

```ts
import { Acryl } from 'acrylblends'
import { clientModules, serve } from 'acrylblends/node-server'
import { app } from './app.ts'

const site = new Acryl()
  .route('/', app)
  .route('/client', clientModules({ root: 'src/client', compiled: 'dist/client' }))

serve({ fetch: site.fetch, port: 3000 })
```

A client component (`src/client/counter.tsx`), with a helper module beside it (`src/client/parts/label.ts`):

```tsx
import { render, useState } from 'acrylblends/jsx/dom'
import { hc } from 'acrylblends/client'
import type { AppType } from '../../app.ts'
import { label } from './parts/label.ts'

const Counter = () => {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{label(count)}</button>
}

render(<Counter />, document.getElementById('counter')!)

const client = hc<AppType>(location.origin)
const { hello } = await (await client.api.hello.$get()).json()
document.getElementById('greeting')!.textContent = `hello ${hello}`
```

```ts
export const label = (count: number): string => `Count ${count}`
```

Start the site with `node site.ts` and open `http://localhost:3000`. Edit `counter.tsx` and reload: the module is compiled again.

Your editor checks the client folder as browser code with its own `src/client/tsconfig.json`: the DOM library, the DOM renderer, no Node
types. This is why `AppType` comes from `app.ts`, which does not import the Node adapter.

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "jsxImportSource": "acrylblends/jsx/dom",
    "types": []
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

## Server markup and `hydrateRoot`

A page can carry server-rendered markup for an island and take it over in the browser with `hydrateRoot` from `acrylblends/jsx/dom/client`:

```tsx
import { useState } from 'acrylblends/jsx/dom'
import { hydrateRoot } from 'acrylblends/jsx/dom/client'

const Counter = () => {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>Count {count}</button>
}

hydrateRoot(document.getElementById('island')!, <Counter />)
```

The DOM renderer does not reuse server markup: `hydrateRoot` renders the component and replaces the element's children with its output
in one step, so the page shows the server markup until the module runs and the component from then on, with no empty frame between. The
server's nodes are gone afterwards, together with anything the visitor did to them before the module ran: focus, a selection, text typed
into an input. Keep the server markup the same as the component's first render, so the swap does not show, and keep inputs out of the
server markup of an island, or render them only in the browser.

## How the imports reach the browser

- JSX in a client module always compiles for the DOM renderer (`acrylblends/jsx/dom`), whatever the server's `tsconfig.json` says. A file's
  own `/** @jsxImportSource ... */` comment still wins.
- `acrylblends/jsx/dom`, its `jsx-runtime`, `jsx-dev-runtime` and `client` are one browser module (`@acrylblends/jsx-dom.js`), and
  `acrylblends/client` is another (`@acrylblends/client.js`). Neither imports anything. The same app serves them, and each import is
  rewritten to a URL relative to the module, so the setup works under whatever path you route `clientModules` at.
- Import your own modules with their file names, as the browser fetches them: `import { label } from './parts/label.ts'`.
- Another package (`import confetti from 'canvas-confetti'`) is left as it is: add an
  [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) to the page for it, or use a bundler.
- `.js` and `.mjs` files are served unchanged.

A module is compiled once and kept in memory until its file changes, up to 16 MiB of compiled code (the least recently served goes first;
set `cacheBytes` to change the bound). Responses carry an `ETag` and `Cache-Control: no-cache`, so the browser revalidates and an edit shows
on the next reload. Only files inside the folder are served: a path with `..` or a dot segment, a `.d.ts` file, a symbolic link out of the
folder and other file types answer 404.

## In production

Templates install `typescript` as a development dependency, and a deploy that leaves those out (`npm ci --omit=dev`) has no compiler.
Compile the client folder once when you build, as the `build` script of your `package.json`:

```json
{
  "scripts": {
    "build": "acrylblends build-client"
  }
}
```

`acrylblends build-client [root] [outDir]` (from acrylblends 0.7.2; `src/client` and `dist/client` when not given) calls
`buildClientModules`. With an earlier version, or without the command line tool, call the function itself:

```json
{
  "scripts": {
    "build": "node --input-type=module -e \"import { buildClientModules } from 'acrylblends/node-server'; buildClientModules({ root: 'src/client', outDir: 'dist/client' })\""
  }
}
```

It writes each module compiled to `dist/client` at the same path and file name, so the page's URLs stay the same, and copies the two
browser modules to `dist/client/@acrylblends/`. Run it where `typescript` is installed, before the development dependencies are removed.

With `NODE_ENV=production` and the `compiled` option set, `clientModules` serves only that folder and compiles nothing. A module that is in
`src/client` but missing from `dist/client` answers 500 with a message to build again, and a `compiled` folder that does not exist stops the
server at startup. Outside production, modules are always compiled on request, so a stale `dist/client` never hides an edit.

When `typescript` is missing where a module has to be compiled, the module answers 500 with the message
`... is a client module, and compiling it needs the typescript package in this app: npm install --save-dev typescript`.

## Reference

`clientModules(options)` returns an app; route it where the page's script tags point.

| Option | Meaning |
| --- | --- |
| `root` | The folder of client modules, absolute or relative to the working directory. |
| `compiled` | The folder `buildClientModules` wrote. Served instead of compiling when `NODE_ENV` is `production`. |
| `cacheBytes` | The bound of the in-memory cache of compiled modules, in bytes. 16 MiB when not given. |

`buildClientModules({ root, outDir })` compiles every module below `root` (dot files, `node_modules` and `.d.ts` files skipped) into `outDir`,
which must not lie inside `root`, and returns the paths it wrote. Files already in `outDir` that no source produces are left there.
