---
name: acryl-change-plugin
description: Use when the user asks you to change, fix, improve, restyle, extend or remove an extension or plugin that already exists in ACRYL.
---
# Change, improve or remove an ACRYL plugin

1. Call acryl_list_plugins to find the plugin and the source directory it was installed from. If it is not listed
   the user may mean a built-in feature; say so instead of guessing.
2. Read its files completely before editing, and the matching doc in {{pack}}/docs/README.md for the plugin type.
3. Edit the source directory (never node_modules, never the pack). For UI changes edit client.js.
4. Call acryl_install_plugin with the same directory: it updates in place, and host code changes take effect in the running
   app automatically ("hostReload": "automatic"). Read the result: if it has a "warning" the plugin could not be staged for
   automatic reload and host changes need an app restart ({{pack}}/docs/delivery/local-live.md); if it has a "next" note, tell
   the user to reload. A change to "inject" or the Config schema also needs a restart.
5. To remove a plugin call acryl_remove_plugin. Confirm with the user first if they did not clearly ask for it.
Report what changed and whether it is live; never claim it works without the tool result.
