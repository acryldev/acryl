# __APP_NAME__

A Cordis app on the ACRYL framework: TypeScript that Node 22.19 or newer runs directly (no build step; erasable syntax only, so no enums and no
parameter properties). Every part of it is a Cordis plugin.

## The framework's API is in `docs/framework/`

Start at `docs/framework/README.md`; `api/summary.md` is the one-page summary. Read before you write routes: `api/routing.md` (the `Acryl` app), `api/request.md` (`c.req`),
`api/context.md` (`c`), `cordis/validation.md` and `guides/validation.md`, `guides/helpers.md` (`streamSSE`), `concepts/middleware.md`, `cordis/plugin-lifecycle.md` (what a plugin
owns and when it is unloaded), `cordis/mounting.md` and `cordis/node-server.md`. Pages marked "not yet available" describe parts that are not in this app.

The docs write `import { Acryl } from 'acrylblends'` and `from 'acrylblends/<subpath>'`. In this app the framework is the vendored plugin source in `plugins/acryl-router/src`
(read it, do not edit it: a change belongs in ACRYL, upstream), so from a file in `src/` import:

- `../plugins/acryl-router/src/index.ts` for `Acryl`, `Context`, `HTTPException`, `connectionOf`, `getConnInfo` and the types;
- `../plugins/acryl-router/src/middleware/index.ts` for every middleware (`cors`, `bodyLimit`, `trimTrailingSlash`, `loopbackOnly`, ...);
- `../plugins/acryl-router/src/helpers/index.ts` for the helpers and validators (`streamSSE`, `schemaValidator`, `validator`, cookies, `testClient`, ...).
- `../plugins/acryl-router/src/core/jsx/index.ts` for `acrylblends/jsx` (`jsx`, `Fragment`, the types), and `.../core/jsx/streaming.ts` for `acrylblends/jsx/streaming`.

**JSX: write `.tsx`.** The scripts in `package.json` run Node.js with `--import ./plugins/acryl-node-server/src/register.ts`, which compiles `.tsx` files with this app's own `typescript`; `tsconfig.json` sets `jsx: react-jsx` and `jsxImportSource: #acryl-jsx`, which `package.json`'s `imports` maps to the vendored runtime in `plugins/acryl-router`. See `src/about.tsx` (blank template) for a page and `test/app.test.ts` for how it is tested. Render a component with `.toString()` and return it with `c.html(...)`; import `jsx`, `Fragment` and the types from `../plugins/acryl-router/src/core/jsx/index.ts` when you need them. A command that starts the app without those scripts (a bare `node src/main.ts`) cannot load a `.tsx` file. Without a build step you can write the call JSX compiles to instead: `jsx('h1', { class: 'title' }, 'Hello')`, children after the props.

**A plugin imports the framework by its package name**: `import { Acryl } from 'acrylblends'` (and `acrylblends/<subpath>`, for example
`acrylblends/helpers`), which resolves to the same files as the relative paths above. Only files in `src/` use the relative paths. `App` is the
deprecated name of `Acryl`.

## How a feature is built: a plugin of its own

**Every feature is a Cordis plugin: a folder `plugins/<name>/` with an `index.ts`, plus its row in `blend.yaml`.** Never wire a feature into
`src/app.ts`, `src/routes.ts` or `src/frame.ts`, and never import it there: the row is what starts it. Settings > Plugins lists it, switches it off
and on (`disabled: true` on its row) and shares it, and every version of the app carries it.

When your prompt names this app's builder docs (`acryl_plugin_docs`), read the doc for your task and its verified example before you write the
plugin; they are this section in full.

```ts
// plugins/notes/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'notes'               // the folder's name; blend.yaml's row names it
export const inject = ['router']          // services it needs (a name nobody provides leaves it waiting, silently)
export function apply(ctx: Context) {
  const app = new Acryl()
    .get('/', (c) => c.json({ ok: true }))
    .post('/', async (c) => c.json(await c.req.json(), 201))
  ctx.router.route('/notes', app)         // build the whole app first: routes added after route() are not served
}
```

```yaml
# blend.yaml, before the `acryl-node-server` row
    - id: notes
      name: notes
```

- Routes are an ordinary `Acryl` app that the plugin mounts once with `ctx.router.route('/notes', app)`; the mount belongs to the plugin and goes
  away when it unloads. The frame that hosts the app in development adds its canvas prefix to every route a plugin mounts: the same plugin
  answers `/notes` under `npm start` and `/app/notes` in the canvas. Write the app's own path, and fetch it from a page by that path
  (`fetch('/notes')`); never put the frame's prefix in a route or a URL.
- A plugin's name is its folder's name. It imports only `@deepseek-ai/cordis` (types), `acrylblends`, `node:*`, its own files, and type-only
  `import type {} from '../home/index.ts'` / `'../instance/index.ts'` for the services those give `ctx`. Never guess another path.
- Something on the first screen (blank template): add `'home'` to `inject` and register a widget in an effect,
  `ctx.effect(() => ctx.home.widget({ id: 'notes', title: 'Notes', render: () => '<ul>...</ul>' }))`; it leaves the page with the plugin.
- Data that must survive a restart goes in a file in `ctx.appInstance.home` (add `'appInstance'` to `inject`), written whole through a temporary
  file and a rename; a variable starts again at every reload. With `plugins/acryl-state`: `ctx.state.cell<T>('notes.list', initial)` (add
  `'state'` to `inject`), served as JSON at `/api/state/<key>` and streamed at `/api/state/<key>/events`.
- Test it in `test/<name>.test.ts` without a socket: boot the app as `test/app.test.ts` does and use `app.root.router.request('/notes')`.

## Things that surprise people

- A page mounted at `/x` answers `/x`, not `/x/` (trailing slashes are strict); `trimTrailingSlash()` (middleware) redirects `/x/` to `/x` for GET and HEAD.
- `schemaValidator('json', ...)` needs a JSON `Content-Type`; without it the schema sees `{}`. A failure answers 400 with
  `{ "error": "invalid json", "issues": [{ "message", "path" }] }`: the human text is `issues[0].message`. A `jsonOnly` recipe in `docs/framework/validation.md` answers 415 instead.
- Throw `new HTTPException(404, { message })` for an error response; the body is the message as plain text (use `c.json({ error }, status)` when a page expects JSON).
- Handlers get the request as `c.req`: `c.req.param('id')`, `c.req.query('q')`, `await c.req.json()`, `c.req.raw` for the Web `Request`.
- A server-sent stream is `streamSSE(c, async (stream) => { await stream.writeSSE({ data: JSON.stringify(x) }) ... })`; call `stream.onAbort(cleanup)`.
- `npm run dev` restarts the app whenever a file changes.
- **In ACRYL's chat, the running app is the process that runs you: never stop, kill or restart it.** A saved change in `blend.yaml`, `src/` or `plugins/` reloads the app by itself and the page beside you shows it; a new plugin starts with that reload once its folder and its row are there. If a change does not show, the reload failed: read the error line in the frame's bar or `look` again, don't restart. `.acryl/bin/acryl plugin ...` is not available there, and is not needed.

## Before you say you are done

`npm test` and `npm run check` (type-check) both pass, and `.acryl/bin/acryl look` shows the feature on the page. Put tests in `test/`, written
with `node:test` like `test/app.test.ts`. A failure names the file and the line: fix the cause in the plugin, never the test, and never move the
feature into `src/` to get around it.
