# @acryldev/shortcuts

ACRYL's keyboard commands, registered on DSH's own shortcut service (`ctx.shortcuts`), and Settings > Shortcuts, which lists and rebinds every command on that service, so a command registered here also appears in DSH's "Edit shortcuts" dialog.

The host half mounts nothing: the row exists so the client bundle is composed. The client half imports the design system from `@acryldev/ui/frame` and registers `Cmd/Ctrl+Shift+P` for the command palette (the palette owner, `@acryldev/workspace`, listens for the `acryl:toggle-command-palette` window event; the two string constants here and there must stay in step).

One package for ACRYL and the Blends frame (spec 051). `pnpm test` in this folder runs its suite.
