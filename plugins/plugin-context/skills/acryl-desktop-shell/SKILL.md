---
name: acryl-desktop-shell
description: Use when the user asks about the Desktop (Electron) app itself: window chrome, title bar, app icon, tray, menu, installer name, or how the Desktop app is structured.
---
# Desktop (Electron) shell

Read {{pack}}/docs/extending/desktop-app.md completely, then {{pack}}/docs/extending/ui-customization.md. The Desktop renderer is the same
client app as Web: theme, brand slots, slots and title text change live with a client plugin (ui-theme, ui-branding docs). The Electron
main process (window options, icon, tray, native menu, product name, installer) changes only by editing apps/acryl-desktop in the ACRYL
repository and rebuilding: name the exact file from the doc and only do it when working inside that repository. A packaged app is
read-only: say so and offer the live alternative. Never disable the sandbox or contextIsolation, never touch the user's real ~/.dsh or
~/.acryl, and ask the user to look at visual changes.
