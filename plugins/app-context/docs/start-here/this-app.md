# This app: what it is made of and how it runs

Read this first, completely, before you change anything in the app.

## The app is its blend.yaml and its plugins

An acrylblends app is a set of Cordis plugins. `blend.yaml` (the Blend) lists them as rows, in the order they start, each with its config and
an on/off switch:

```yaml
spec:
  rows:
    - id: router
      name: '@acryldev/router'      # a library plugin: src/app.ts imports it into `registry`
    - id: home
      name: home              # the home page's widgets (ctx.home)
    - id: routes
      name: routes            # src/routes.ts: the app's first screen, /about, /health
    - id: notes
      name: notes             # one of the app's own plugins: plugins/notes/index.ts
    - id: extensions
      name: extensions
    - id: server
      name: '@acryldev/node-server'
```

A row's `name` is either a library plugin that `src/app.ts` imports into its `registry`, or the name of a folder in `plugins/` that is the
app's own plugin (any folder `plugins/library.json` does not list). The app's own plugins need no import anywhere: the row is the whole wiring.

`blend.yaml` plus `plugins/` plus `src/` is the app. A saved version is a commit of them, a shared app or a blueprint is a copy of them, and
an app made from that copy starts the same plugins. Nothing that matters lives anywhere else.

## The rule: every feature is a plugin of its own

A feature (a widget, a page, an API, a store of data) is one plugin: a folder `plugins/<name>/` with an `index.ts` that exports `name`,
`inject` and `apply`, plus one row in `blend.yaml`. See [the feature plugin](../extending/feature-plugin.md).

Never wire a feature into `src/frame.ts`, `src/app.ts` or `src/routes.ts`, and never mount a plugin by hand with `ctx.plugin(...)`. Those
files are the app's frame: a feature written there cannot be switched off in Settings > Plugins, does not show in the plugin list, cannot be
shared to the plugin registry, and leaves when someone regenerates the frame.

## Never edit node_modules: core parts are shared

The packages in `node_modules` (the frame, the chat, the left and right panels, `@acryldev/*`) are shared by every app on this computer and are
read-only: on Linux and Windows an edit there fails (`EACCES` or `EPERM`), and anywhere the next `npm install` or update replaces it. Change what is
the app's own instead: its `src/`, its `blend.yaml`, and its `plugins/` (the library plugins `acrylblends add` copied there are the app's own copies).
When a change needs a core part that lives only in `node_modules`, do not patch it: tell the person which part it is and that the app must own that
plugin first (its own copy in `plugins/`, mounted in place of the shared one; spec 052 D18).

## Where it runs

- **In the frame** (`npm run dev`, `npm run desktop`): the ACRYL frame's host composes the app's `blend.yaml` rows beside its own (the chat,
  the terminals, the door) and shows the app's page in the canvas at `/app`. The frame's host owns the router, the server and the door, so
  those rows of `blend.yaml` are left to it; every other row runs exactly as below. `src/frame.ts` only claims the `/app` prefix.
- **On its own server** (`npm start`, production): `src/main.ts` composes every row of `blend.yaml` and listens. In production the app's own
  plugins start read-only: nothing can be installed while it runs.

A plugin writes its routes with the app's own paths (`/notes`, `/notes/items`). In the frame the same routes answer under the canvas prefix
(`/app/notes`), and a page in the canvas that asks for `/notes/items` is served there. Never write `/app` in a plugin.

## What reloads what (in the frame)

The frame watches `blend.yaml`, `src/` and `plugins/`. 300 ms after the last change it imports the app's code again and, if it loads, stops
the app's rows and starts them from the new code, then reloads the canvas. The chat, the terminals and the agents around the app keep running.

- If the new code does not load (a syntax error, an import that does not resolve) or a row does not start, the frame keeps the last good code
  running and the person sees one line in the top bar: `Not reloaded: <file>:<line> <error>`. Fix the cause; the next change loads.
- Data a plugin keeps in memory starts again at each reload. Keep what must survive in a file ([state](../extending/state.md)).
- Settings > Plugins writes `blend.yaml` (a row's `disabled: true`), so a switch is a reload like any other change.

## Imports a plugin uses

```ts
import type { Context } from '@deepseek-ai/cordis'   // the plugin's context type
import { Acryl } from 'acrylblends'                    // routes: an Acryl app (the web framework; docs/framework/ in this app)
import type {} from '../home/index.ts'                 // types ctx.home (the home row's service)
import type {} from '@acryldev/instance'             // types ctx.appInstance (where the app keeps its data)
```

Only these. Never import from `src/`, from another plugin's files, from `plugins/router/src/...` or from a path you have not seen in
this app: `import type` lines are erased when the code runs, every other import must resolve in this folder. Check a path before you use it.

## The door: look at the running page

`.acryl/bin/acryl look` prints the page in the canvas as text with refs; `.acryl/bin/acryl act click --ref <ref>` acts on it; `brief` says what
the door can do. Use it to see that your feature is on the page. See [verify before done](verify-before-done.md).

A request to click, open, close, collapse, show, scroll or type on screen is done with the door, never by editing code. The ACRYL frame around
the app (its left panel of branches and versions, its right panel of agents, Build and Preview, Settings) is not part of the app: `look` says what
it shows, and `.acryl/bin/acryl frame close left` (or `open`, `toggle`, `left`/`right`, `settings [section]`, `build`, `preview`) operates it.
Change code only when the person asks to change the app.

## Read next

- [The feature plugin](../extending/feature-plugin.md), then the page for what the feature needs: [routes and pages](../extending/routes-and-pages.md),
  [a home widget](../extending/home-widget.md), [state](../extending/state.md).
- The nearest verified example in `../example-plugins/README.md`.
- [Verify before done](verify-before-done.md) and, when something is wrong, [troubleshooting](troubleshooting.md).
