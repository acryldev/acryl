---
name: acryl-improve-ui
description: Use when the user asks to improve, restyle, redesign, extend or fix the look of a UI plugin you or they already have (button, panel, sidebar tab, board).
---
# Improve or change an existing UI plugin

Call acryl_list_plugins to find the package directory, then read its client.js completely and
{{pack}}/docs/extending/client-slot.md. Edit in place: keep the wrapper id, keep exports, keep the localStorage key so the
user's data survives. Prefer small edits over rewrites. Keep no-build rules (createElement, require, no JSX/import).
Run acryl_verify_plugin, then acryl_install_plugin again (it updates in place) and ask the user to reload the page or
window. Tell the user exactly what changed.
