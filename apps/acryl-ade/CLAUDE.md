# acryl-ade

A Cordis app on the ACRYL framework: TypeScript that Node 22.19 or newer runs directly (no build step; erasable syntax only, so no enums and no
parameter properties). Every part of it is a Cordis plugin.

## The framework's API is in `docs/framework/`

Start at `docs/framework/README.md`; `api/summary.md` is the one-page summary. Read before you write routes: `api/routing.md` (the `Acryl` app), `api/request.md` (`c.req`),
`api/context.md` (`c`), `cordis/validation.md` and `guides/validation.md`, `guides/helpers.md` (`streamSSE`), `concepts/middleware.md`, `cordis/plugin-lifecycle.md` (what a plugin
owns and when it is unloaded), `cordis/mounting.md` and `cordis/node-server.md`. Pages marked "not yet available" describe parts that are not in this app.

The docs write `import { Acryl } from '@acryldev/blends'` and `from '@acryldev/blends/<subpath>'`. In this app the framework is the vendored plugin source in `plugins/acryl-router/src`
(read it, do not edit it: a change belongs in ACRYL, upstream), so from a file in `src/` import:

- `../plugins/acryl-router/src/index.ts` for `Acryl`, `Context`, `HTTPException`, `connectionOf`, `getConnInfo` and the types;
- `../plugins/acryl-router/src/middleware/index.ts` for every middleware (`cors`, `bodyLimit`, `trimTrailingSlash`, `loopbackOnly`, ...);
- `../plugins/acryl-router/src/helpers/index.ts` for the helpers and validators (`streamSSE`, `schemaValidator`, `validator`, cookies, `testClient`, ...).
- `../plugins/acryl-router/src/core/jsx/index.ts` for `acrylblends/jsx` (`jsx`, `Fragment`, the types), and `.../core/jsx/streaming.ts` for `acrylblends/jsx/streaming`.

**JSX: write `.tsx`.** The scripts in `package.json` run Node.js with `--import ./plugins/acryl-node-server/src/register.ts`, which compiles `.tsx` files with this app's own `typescript`; `tsconfig.json` sets `jsx: react-jsx` and `jsxImportSource: #acryl-jsx`, which `package.json`'s `imports` maps to the vendored runtime in `plugins/router`. See `src/about.tsx` (blank template) for a page and `test/app.test.ts` for how it is tested. Render a component with `.toString()` and return it with `c.html(...)`; import `jsx`, `Fragment` and the types from `../plugins/acryl-router/src/core/jsx/index.ts` when you need them. A command that starts the app without those scripts (a bare `node src/main.ts`) cannot load a `.tsx` file. Without a build step you can write the call JSX compiles to instead: `jsx('h1', { class: 'title' }, 'Hello')`, children after the props.

**A plugin imports the framework by its package name**: `import { Acryl } from '@acryldev/blends'` (and `acrylblends/<subpath>`, for example
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
import { Acryl } from '@acryldev/blends'

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
# blend.yaml, before the `@acryldev/node-server` row
    - id: notes
      name: notes
```

- Routes are an ordinary `Acryl` app that the plugin mounts once with `ctx.router.route('/notes', app)`; the mount belongs to the plugin and goes
  away when it unloads. The frame that hosts the app in development adds its canvas prefix to every route a plugin mounts: the same plugin
  answers `/notes` under `npm start` and `/app/notes` in the canvas. Write the app's own path, and fetch it from a page by that path
  (`fetch('/notes')`); never put the frame's prefix in a route or a URL.
- A plugin's name is its folder's name. It imports only `@deepseek-ai/cordis` (types), `acrylblends`, `node:*`, its own files, and type-only
  `import type {} from '../home/index.ts'` / `'@acryldev/instance'` for the services those give `ctx`. Never guess another path.
- Something on the first screen (blank template): add `'home'` to `inject` and register a widget in an effect,
  `ctx.effect(() => ctx.home.widget({ id: 'notes', title: 'Notes', render: () => '<ul>...</ul>' }))`; it leaves the page with the plugin.
- Data that must survive a restart goes in a file in `ctx.appInstance.home` (add `'appInstance'` to `inject`), written whole through a temporary
  file and a rename; a variable starts again at every reload. With `plugins/state`: `ctx.state.cell<T>('notes.list', initial)` (add
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

## Defaults you can swap

The framework is not rigid. Every choice is a plugin behind a port, and what the app starts with is only a fallback. Name the default before you change it,
and swap it at the one place that mounts it.

| Choice | Default | To swap it |
| --- | --- | --- |
| Records | the `db` port on SQLite (already mounted in the notes and chat templates; elsewhere `npx acrylblends add db`) | mount another provider of `db` in `src/app.ts`; plugins use `ctx.db` and do not change |
| Small state | the `kv` port on one JSON file (`npx acrylblends add kv`) | mount `@acryldev/kv-db` (the same port over `db`) or a provider of your own |
| Server | Node (`@acryldev/node-server`) | mount the adapter of another runtime in `src/app.ts` |
| Window | the browser | `npx acrylblends add desktop` adds an Electron window on the same server |

- **An outside tool** (a database server, a bundler, a router such as Vike) joins the app as a provider: a plugin in `plugins/<name>/` that implements a port and
  passes that port's conformance tests, then `src/app.ts` mounts it. Postgres is such a provider and is not part of this package; add it when the app needs it.
- **The dependency rule:** only the file that mounts a provider imports it; everything else takes the port as an argument or injects it. `npx acrylblends check-deps` enforces it.

## Plugins

There is one plugin folder: `plugins/` at the root of the app. A plugin is a folder `plugins/<name>/` with an `index.ts`. `npx acrylblends add <name>` copies a library
plugin there; a plugin you or an agent write goes there too (the `extensions` plugin installs it into the running app, and `plugins/library.json` lists the copies it must not
install a second time). Do not create `src/plugins/` or `extensions/`.

## The door

The door is a command in this folder, `.acryl/bin/acryl`, that lets you look at and change the running app. The running app writes it, and it reaches only the app running from this folder. Its state (a secret and an audit log) lives under `.acryl/`, which git ignores: never commit it. It is on in development and off with `NODE_ENV=production` or `ACRYL_DOOR=off`; one process at a time serves a folder's door, so a second `npm start` in the same folder stops with a message that says so (the tests set `ACRYL_DOOR=off`). If `.acryl/bin/acryl` is not here, the app is not running: start it with `npm run dev` (in the background) and open its address in a browser.

```
.acryl/bin/acryl brief                      what this app is: its address (curl a new route there), where the docs are, the verbs, and whether a page is open
.acryl/bin/acryl look                       the page as text, with refs (1.1, 1.2, ...): roles, names, values, visible text
.acryl/bin/acryl act click --ref <r>
.acryl/bin/acryl act type --ref <r> --text <t> [--submit] [--no-clear]
.acryl/bin/acryl act select --ref <r> --option <o>
.acryl/bin/acryl act press --key <Enter|Escape|...>
.acryl/bin/acryl act scroll [--ref <r>] --direction up|down [--amount <n>]
.acryl/bin/acryl act wait (--text <t> | --role <role> [--name <n>]) [--gone] [--timeout-ms <ms>]
.acryl/bin/acryl act reload                 reload the page; answers once the new page is back
.acryl/bin/acryl act navigate --path <path> go to another path of the app, e.g. /settings (never another site)
.acryl/bin/acryl plugin list | add <folder> | remove <name> | reload
.acryl/bin/acryl tool list | call --tool <name> --args '<json>'
.acryl/bin/acryl verbs                      the verb list
```

- **Check your own UI work with `look` and `act`.** After you build or change something people see, open the page and use it the way a person would: look, click through the new feature, look again, and say what you saw. A plugin you add, remove or reload with `plugin add|remove|reload` reloads the open pages by itself and the verb answers once they are back; after you change any other file (`src/`, a page) run `act reload`, then `look`. A page is a path of the app: `act navigate --path /demo`.
- The door's page script is added to every HTML page in development, so a page you write needs no tag for `look` and `act` to see it.
- `look` and `act` need the app's page open in a browser (`brief` says `Page: not open` when it is not). Look again before each `act`: refs belong to the latest `look`.
- A password field is not shown and cannot be typed into through the door; sign in by hand, or test the sign-in with a test.
- Every verb takes `--json`. The exit code is 0 for done, 1 when the verb failed, 2 for a usage error and 3 when no app is running in this folder.
- `plugin add plugins/<name>` checks the plugin, installs it and makes it live without a restart (the `extensions` plugin does this; every template that has the door has it, in development only: it is left out with `NODE_ENV=production`). `tool call` reaches only the tools on the door's allowlist (empty by default). On Windows the command is `.acryl\bin\acryl.cmd`.

## This app (nodejs)

A web app: routes, a server-rendered JSX page, and a client component, all plugins of a Cordis app. `src/routes.ts` is the app's own plugin: it builds an `Acryl` app
(`pages`) and mounts it with `ctx.router.route`, and mounts `clientModules` at `/client`. `blend.yaml` lists the plugins that are mounted. `acrylblends add <plugin>` copies
another library plugin (for example `@acryldev/state` or `db`) into `plugins/`. Test a route by booting the app (`createApp` in `src/app.ts`, see `test/app.test.ts`) and calling it with `fetch`.

- **Client components** (run in the browser) live in `src/client/`, which has its own `tsconfig.json` (DOM types, no Node types); `clientModules` compiles them when the browser asks, and `npm run build` compiles them once into `dist/client` for production (`NODE_ENV=production` serves only that folder). See `src/client/counter.tsx` and `docs/framework/guides/client-modules.md`.
- The server listens on `127.0.0.1`; `PORT` chooses the port and `HOST=0.0.0.0` is for a container only.
