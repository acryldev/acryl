---
name: acryl-change-plugin
description: Use when the person asks you to change, improve, extend or restyle a feature or plugin that already exists in __APP_NAME__.
---
# Change a plugin

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it).

1. Find it: the feature's folder in `plugins/` and its row in `blend.yaml` (Settings > Plugins lists them too). If no plugin has it, it may be
   part of the app's own page in `src/`; say so instead of guessing.
2. Read every file of the plugin before editing, and the doc for what you change (`<docs>/docs/README.md`).
3. Edit its folder. The frame reloads the app 300 ms after the change; a change to `inject` or the row's config reloads it the same way.
   Keep its name: a new name is a new plugin with a new row.
4. Update its test, then verify (`<docs>/docs/start-here/verify-before-done.md`) and say what changed and that it is on the page.
