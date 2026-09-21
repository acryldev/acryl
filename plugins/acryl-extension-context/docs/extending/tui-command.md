# Terminal (tui) commands

Example: `../example-plugins/packages/tui-command-basic/`. The CLI host provides `tuiCommands`; read it
with `ctx.get('tuiCommands')` (optional, absent on web and desktop, never `inject` it) and
`commands.register({ command: '/name', description, packageName, open({ tui, close }) => Component })`,
inside `ctx.effect` (it returns a disposer). A `Component` is a pi-tui object:
`render(width) => string[]`, `handleInput?(data)`, `invalidate()`. Name collisions never throw; they are
addressed as `/name:<package>`. Source: `apps/acryl-cli/src/tui/tui-commands-service.ts`.
