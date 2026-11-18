
## This app (blank)

The first screen (`src/routes.ts`) shows the app's name and, below it, the widget of every plugin that registers one with `ctx.home.widget`
(the `home` row). A new feature is a plugin of its own with its row in `blend.yaml`, never a change to `src/routes.ts`. `acrylblends add <plugin>`
copies another library plugin (for example `acryl-state`) into `plugins/`.
