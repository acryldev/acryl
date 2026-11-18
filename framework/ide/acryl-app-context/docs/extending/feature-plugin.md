# The feature plugin

Every feature of this app is one Cordis plugin: a folder in `plugins/` and a row in `blend.yaml`. This page is its shape. Read
[this app](../start-here/this-app.md) first.

## 1. The folder

`plugins/<name>/index.ts`, where `<name>` is lowercase letters, digits and dashes (`notes`, `due-dates`). The folder's name is the plugin's
name, its row id and the name it is shared under. Pick a name no folder in `plugins/` has yet.

```ts
/** Notes: a list of short notes on the home page. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from '../home/index.ts'

export const name = 'notes'
export const inject = ['router', 'home']

export function apply(ctx: Context): void {
  ctx.router.route('/notes', new Acryl().get('/items', (c) => c.json([])))
  ctx.effect(() => ctx.home.widget({ id: 'notes', title: 'Notes', render: () => '<ul id="notes"></ul>' }))
}
```

- `name` equals the folder's name, or the plugin does not start.
- `inject` lists the services `apply` uses: `router` for routes, `home` for a widget, `appInstance` for where the app keeps files. A plugin
  whose service is missing waits (PENDING) instead of failing.
- The first sentence of the leading doc comment is what Settings > Plugins shows for the plugin. Say what it does for the person.
- Everything the plugin acquires is released with it: routes mounted with `ctx.router.route` and widgets registered inside `ctx.effect` go away
  when the plugin is switched off or removed. A timer, a watcher or a socket belongs in one `ctx.effect(() => { ...; return () => stop })`.
- More files are fine (`plugins/notes/store.ts`), imported relatively from `index.ts`.

## 2. The row

Add the row to `blend.yaml` under `spec.rows`, after the `routes` row and before the `extensions` row:

```yaml
    # Notes: a list of short notes on the home page.
    - id: notes
      name: notes
```

The comment above the row is the description Settings > Plugins shows when the plugin has no doc comment. The row is all the wiring: do not
import the plugin in `src/app.ts`, `src/routes.ts` or `src/frame.ts`.

## 3. A test

Add `test/<name>.test.ts`: boot the app the way `test/app.test.ts` does (copy its `withApp`), request your routes and the home page
(`app.root.router.request('/', { headers: { accept: 'text/html' } })`) and assert what the person should see. The test composes the same
`blend.yaml` the frame does, so it fails the same way the frame would.

## 4. Check it

Follow [verify before done](../start-here/verify-before-done.md): `npm test`, `npm run check`, then `.acryl/bin/acryl look` on the canvas.

## What the plugin needs next

- Its own page or an API: [routes and pages](routes-and-pages.md), example `route-page-basic`.
- UI on the app's first screen: [a home widget](home-widget.md), example `home-widget-basic`.
- Data that survives a restart: [state](state.md), example `state-json-file`.
- Switching it off, removing it, sharing it: [switch and remove](../delivery/switch-and-remove.md), [share and snapshot](../delivery/share-and-snapshot.md).
