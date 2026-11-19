# Troubleshooting

The errors this app gives, what each one means, and the fix. `npm test` prints them with the file and line; in the frame the person sees the
same error as one line in the top bar (`Not reloaded: ...`) while the last good code keeps running.

## Not reloaded: Cannot find module '.../plugins/<name>/x.ts' imported from .../plugins/<name>/index.ts

`ERR_MODULE_NOT_FOUND`: an import in your plugin names a file or package that is not there. You guessed a path. A plugin imports only:
`@deepseek-ai/cordis` (types), `acrylblends` (the web framework), `node:*`, its own files (`./store.ts`), and type-only
`import type {} from '../home/index.ts'` / `'../instance/index.ts'`. Never `../acryl-router/src/...`, `../plugins/...`, `../../src/...` or a
package that is not in `package.json`. Open the folder and check the path before you import it.

## Not reloaded: plugins/<folder> exports the plugin name "<x>"; a plugin's name is its folder's, "<folder>"

`export const name` must equal the folder's name. Rename one of them (the row's `id` and `name` follow the folder).

## blend.yaml is not a valid app manifest: spec.rows[n].name: no plugin '<name>' in the app's registry [unknown-plugin]

The row names a plugin that is neither a library plugin of `src/app.ts` nor a folder `plugins/<name>/` with an `index.ts`. The list after
`known:` is what exists. Fix the row's `name` or the folder's name; do not add an import to `src/app.ts`.

## The plugin loads but nothing shows, and there is no error

- `inject` names a service nobody provides (a typo, or a library plugin the app does not have): the plugin waits (PENDING) and never runs. Use
  only `router`, `home` and `appInstance`, or a service whose row is in `blend.yaml`.
- The widget is registered outside `ctx.effect`, or not at all: see [a home widget](../extending/home-widget.md).
- The row is `disabled: true` (someone switched it off in Settings > Plugins), or the row is missing: the folder alone is not enough.
- The page is cached in the canvas: `.acryl/bin/acryl act reload`, then `look`.

## The widget shows, but its buttons do nothing

The widget's script failed or calls the wrong URL. It must fetch the plugin's own route by the app's path (`fetch('/notes/items')`, never
`/app/notes/items` or `./notes`), its element ids must be unique on the page (prefix them with the plugin's name), and a module script must be
`<script type="module">`. Run the request yourself in a test (`app.root.router.request('/notes/items', { method: 'POST', ... })`).

## "<name>" is a row of blend.yaml, so the app starts it ... it is not installed here

`.acryl/bin/acryl plugin add plugins/<name>` installs a folder without a row (a live install). A plugin with a row is the app's own: the app
starts it, and a change to its folder reloads it. Run `npm test` instead.

## Data is gone after a reload

The plugin kept it in a variable. Keep it in a file in `ctx.appInstance.home`: [state](../extending/state.md).

## A change does not show in the canvas

The frame reloads 300 ms after the last change to `blend.yaml`, `src/` or `plugins/`. If `look` still shows the old page, the new code did not
load: run `npm test` and `npm run check` and fix the first error. Never restart the frame or edit `src/frame.ts` to force it.
