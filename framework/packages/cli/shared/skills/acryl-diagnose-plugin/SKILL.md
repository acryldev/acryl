---
name: acryl-diagnose-plugin
description: Use when a feature of __APP_NAME__ misbehaves and the cause is unclear - nothing shows, buttons do nothing, data is lost, the top bar says Not reloaded, or a check fails in a way you do not understand.
---
# Diagnose a plugin methodically

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it).

Read `<docs>/docs/start-here/troubleshooting.md`. Then, in order: (1) `npm test` and `npm run check`, and read the first error completely
(it names the file and the line); (2) `.acryl/bin/acryl look` to see what the page shows now; (3) check the plugin's row in `blend.yaml`
(present, not `disabled: true`, the folder's name) and that every name in `inject` is provided (a missing service leaves the plugin waiting
without an error); (4) change ONE thing, run the checks again, look again. Never guess a state you have not read. If the same cause survives two
fixes, stop and tell the person what you observed.
