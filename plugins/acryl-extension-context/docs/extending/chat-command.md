# Chat slash commands

Use this to give the user a `/command` in the chat that runs on the host WITHOUT calling the model: reload something,
export a file, toggle a mode, show a status. It works on all three surfaces (CLI, Web, Desktop).

Working example: `../examples/packages/chat-command-basic/` (read it fully).

```js
export const name = 'my-commands'
export const inject = ['commands']
export function apply(ctx) {
  ctx.effect(function* () {
    yield ctx.commands.register({
      name: 'hello-example', description: 'Say hello',
      async handler(invocation) { return { kind: 'success', text: `Hello, ${invocation.rawInput.trim() || 'world'}!` } },
    })
  }, 'my-commands: /hello-example')
}
```

- The handler returns `{ kind: 'success' | 'error', text }`; the text is shown to the user, not sent to the model.
- `invocation.rawInput` is the text after the command; `invocation.signal` aborts a long handler; `invocation.agent` is the
  session's agent. Register inside `ctx.effect` so the command leaves with the plugin.
- Names are unique per session; a name already taken by a built-in wins, so pick a distinctive one.
- Do not use it for output the model must see (use a tool), and do not confuse it with `tuiCommands`, which opens a terminal
  overlay (`extending/tui-command.md`).
- The pack's own `/reload` is a real, tested example: `../index.js`.
- Contract: `reference/subsystems/commands.md`. Where it appears in each surface: `maps/mount-points.md`.
