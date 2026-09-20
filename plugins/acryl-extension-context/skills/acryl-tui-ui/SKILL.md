---
name: acryl-tui-ui
description: Use when the user is in the terminal (CLI) and wants a UI, panel, overlay, list or restyle: pi-tui components, colors and branding in the terminal.
---
# Terminal (CLI) UI

Read {{pack}}/docs/extending/tui-components.md completely and {{pack}}/docs/extending/tui-command.md, then copy
{{pack}}/examples/packages/tui-overlay-themed/. The terminal has one plugin UI seam: a slash-command overlay (tuiCommands) built from pi-tui
components; there are no browser slots. Rules: no line wider than the width (use truncateToWidth and visibleWidth), handle Escape, keep your
own semantic palette, color foregrounds only. The CLI's built-in palette, banner and wordmark are compiled in (only editable in the
ACRYL source repository followed by a rebuild): never promise to restyle them from a plugin. The new command appears after the TUI
restarts. You cannot see the terminal: ask the user to run the command and report what they see.
