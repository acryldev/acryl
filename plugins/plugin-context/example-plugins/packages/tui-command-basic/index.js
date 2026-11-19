// Example: tui-command.basic
// Type:     tui-contribution
// Surfaces: tui
// Teaches:  ctx.get('tuiCommands') exists only in the CLI host: read it OPTIONALLY, never inject it. Register returns a disposer; wrap it in ctx.effect.
// Expect:   ACTIVE everywhere; the /hello command exists only on tui.
// Docs:     extending.tui-command
// Pattern:  apps/acryl-cli/src/tui/tui-commands-service.ts
export const name = 'acryl-example-tui-command'

export function apply(ctx) {
  const commands = ctx.get('tuiCommands')   // undefined on web and desktop: that is fine
  if (!commands) return
  ctx.effect(() => commands.register({
    command: '/hello',
    description: 'Say hello (example plugin)',
    packageName: 'acryl-example-tui-command',
    // A pi-tui Component: render(width) returns lines, handleInput gets keys.
    open: ({ close }) => ({
      render: () => ['', '  Hello from an installed plugin. Press any key to close.', ''],
      handleInput: () => close(),
      invalidate: () => {},
    }),
  }))
}
