---
name: acryl-diagnose-plugin
description: Use when something you built misbehaves and the cause is unclear: PENDING, FAILED, invisible UI, stale code, doubled behavior after reload.
---
# Diagnose a plugin methodically

Read {{pack}}/docs/start-here/troubleshooting.md, then {{pack}}/docs/reference/cordis-api/fiber.md if the state
machine matters. Order: (1) call acryl_list_plugins and read the install result you got, (2) run acryl_verify_plugin on
the source folder, (3) for UI add console.info('[<name>] ...') lines, ask the user to reload and read what the browser
console shows, (4) change ONE thing, update with acryl_install_plugin, re-read the status. Never guess a state you have
not read from a tool result. If the same cause survives two fixes, stop and tell the user what you observed.
