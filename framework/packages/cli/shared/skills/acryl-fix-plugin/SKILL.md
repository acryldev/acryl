---
name: acryl-fix-plugin
description: Use when a plugin you wrote in __APP_NAME__ fails - npm test or npm run check fails, the top bar says "Not reloaded", or the feature is not on the page.
---
# Fix a plugin that does not work

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it).

Read `<docs>/docs/start-here/troubleshooting.md` and `<docs>/docs/start-here/verify-before-done.md`. The error is the real cause: read it
first. `Cannot find module` is a guessed import (a plugin imports only `@deepseek-ai/cordis`, `acrylblends`, `node:*` and its own files);
`exports the plugin name` means `name` differs from the folder; `no plugin '<name>' in the app's registry` means the row names a folder that is
not there; a plugin with no error and nothing on the page waits for a service its `inject` names. Fix the cause in the plugin (never the test,
never by moving the feature into `src/`), run the checks again, and only then tell the person it works.
