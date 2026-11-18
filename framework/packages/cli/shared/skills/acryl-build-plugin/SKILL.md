---
name: acryl-build-plugin
description: Use when the person asks for a new feature, widget, page, tool, list or integration in __APP_NAME__ (build a plugin). The workflow from reading the docs to a feature that is on the page and checked.
---
# Build a feature as a plugin

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it).

1. Read `<docs>/docs/start-here/this-app.md` completely: what the app is made of, the rule (a feature is `plugins/<name>/` plus its row in
   `blend.yaml`, never code in `src/`) and the imports a plugin may use.
2. Pick the docs for the feature from `<docs>/docs/README.md` (read-it-when column): routes and pages, a home widget, state. Read each one
   completely and follow its links.
3. Open the closest verified example in `<docs>/example-plugins/README.md` and read every file of it. Copy it to `plugins/<name>/` and change
   it: `name` equals the folder's name, `inject` names only services that exist (`router`, `home`, `appInstance`, or a row's service).
   Never guess a plugin's shape or an import path from memory.
4. Add its row to `blend.yaml` before the `acryl-node-server` row (`- id: <name>` / `name: <name>`). Do not touch `src/app.ts`,
   `src/routes.ts` or `src/frame.ts`.
5. Write `test/<name>.test.ts` like `test/app.test.ts`: the widget is on the first screen, the routes answer, the data survives a remount.
6. Verify (`<docs>/docs/start-here/verify-before-done.md`): `npm test`, `npm run check`, then `.acryl/bin/acryl look` shows it. Fix the
   cause of the first failure and run again.
7. Tell the person what you built, where it is on the page, and that it is the plugin `<name>` in Settings > Plugins. Never claim it works
   before the three checks agree.
