# Example plugins

<!-- Generated from docs/docs.json by scripts/build-manifest.mjs. Do not edit here. -->

Every example is a real plugin folder. The pack gate copies each one into an app's
`plugins/`, mounts it by its row with the app's router and home page, and checks the
outcome its scenario declares (`scenarios.json`). Find the closest, read every file of
it, then copy it to `plugins/<your-name>/` and adapt it.

| Example | Type | Teaches | Surfaces | Docs |
| --- | --- | --- | --- | --- |
| [route-page-basic](packages/route-page-basic/) | route | A page and a JSON route of the plugin's own, mounted with ctx.router.route and gone when the plugin is off. | frame standalone | extending.routes-and-pages, extending.feature-plugin |
| [home-widget-basic](packages/home-widget-basic/) | home-widget | A widget on the first screen with a button that calls the plugin's own route; it leaves with the plugin. | frame standalone | extending.home-widget, extending.feature-plugin |
| [state-json-file](packages/state-json-file/) | state | A list kept in a JSON file in the app's home (atomic writes, ids, validation, escaping), with routes and a widget with a form. | frame standalone | extending.state, extending.home-widget |
