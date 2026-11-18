---
name: acryl-add-ui
description: Use when a feature of __APP_NAME__ needs something the person sees - a widget on the first screen, a page of its own, a button or a form.
---
# Add UI to the app

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it).

The app's UI is HTML its plugins serve. Two places:

- **On the first screen (the canvas)**: a widget. Read `<docs>/docs/extending/home-widget.md` completely and the example
  `<docs>/example-plugins/packages/home-widget-basic/`. Add `'home'` to `inject`, register the widget inside `ctx.effect`, escape every value
  you put into its HTML, prefix its element ids with the plugin's name, and let its `<script type="module">` fetch the plugin's own routes by the
  app's path (`fetch('/<name>/items')`, never `/app/...` or `./...`).
- **A page of its own**: read `<docs>/docs/extending/routes-and-pages.md` and the example `route-page-basic`; link to it from the widget.

Decide where the data lives first (`<docs>/docs/extending/state.md`): what the person types must survive a reload, so it goes in a file in
`ctx.appInstance.home`, never only in a variable or in `localStorage`. Then build it with the acryl-build-plugin workflow and check the page with
`.acryl/bin/acryl look` and `act`.
