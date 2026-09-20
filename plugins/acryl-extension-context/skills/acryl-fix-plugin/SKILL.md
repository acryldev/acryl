---
name: acryl-fix-plugin
description: Use when a plugin you installed is PENDING, FAILED, not visible, or the acryl_install_plugin tool returned an error.
---
# Fix a plugin that does not work

Read {{pack}}/docs/delivery/local-live.md (failure states) and {{pack}}/docs/start-here/verify-before-done.md.
Read the tool result's stage and message first: it is the real cause. PENDING means an inject names a service
nobody provides (provide it, never delete the inject). FAILED means apply() threw (read the error). Installed
but not live usually means exports lacks "./package.json". UI not visible means the page was not reloaded or
client.js failed to load (no JSX or import, wrapper id equal to the package name). Fix the cause, call the tool
again, and only then tell the user it works.
