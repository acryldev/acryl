---
name: acryl-remove-plugin
description: Use when the person asks to remove, delete, switch off, hide or undo a feature or plugin of __APP_NAME__.
---
# Switch off or remove a plugin

`<docs>` is the builder docs folder that the `acryl_plugin_docs` section of your prompt names (paths below are under it). Read `<docs>/docs/delivery/switch-and-remove.md`.

Find the exact plugin in `plugins/` and its row in `blend.yaml` (never guess the name). To hide it for now, switch it off: `disabled: true` on
its row (the switch in Settings > Plugins does the same); everything stays and it comes back when switched on. To remove it, and only when the
person clearly asked: delete its row, its folder and its test; its data in `~/.acryl/apps/<id>/data/` stays unless they ask. Check with `npm test` and
`.acryl/bin/acryl look` that it is gone before you say so. Only touch the plugin the person named.
