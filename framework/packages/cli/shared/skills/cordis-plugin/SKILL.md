---
name: cordis-plugin
description: Add a Cordis plugin to __APP_NAME__ - a plugins/<name>/ folder with name, inject, apply and an optional check, its routes as an Acryl app, how its blend.yaml row mounts it, and how to verify it. Use when a feature should be its own plugin, or when asked to extend the app.
---

# Adding a Cordis plugin

A plugin is a folder `plugins/<name>/` with an `index.ts` exporting `name` (its id), `inject` (the services it needs) and `apply(ctx)`. Everything it acquires belongs to one `ctx.effect(...)`, so unloading the plugin or stopping the app releases it.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'due-dates'
export const inject = ['router']

export function apply(ctx: Context): void {
  const app = new Acryl().get('/due-dates', (c) => c.json({ ok: true }))
  ctx.router.route('/due-dates', app)
}
```

- **Routes** are an `Acryl` app mounted with `ctx.router.route('/due-dates', app)`; removing the plugin removes them. Write the app's own path: the frame that hosts the app in development adds its canvas prefix, so the same route answers `/due-dates` under `npm start` and `/app/due-dates` in the canvas. Never put the frame's prefix in a plugin's route. Import the framework by name (`acrylblends`, `acrylblends/body-limit`); never guess a relative path into another plugin.
- **State** lives in cells: `ctx.state.cell('due-dates.tasks', [])`. A page follows one with `watch` from `/api/state/client.js`, never with an `EventSource`, and never by polling what `watch` already pushes.
- **Its row starts it.** Add a row to `blend.yaml` (`- id: <name>` and `name: <name>`, before the `acryl-node-server` row); `src/app.ts` finds the folder by that name, so it is never imported there. `disabled: true` on the row switches it off (Settings > Plugins does the same). `.acryl/bin/acryl plugin add plugins/<name>` installs a folder without a row live, for trying it; a folder with a row is the app's.
- **Check it.** `npm test` and `npm run check` must pass. With the app running, use the door: `.acryl/bin/acryl look` reads the page as text with refs and `acryl act ...` acts on it; an install or reload shows the new feature in the page.
