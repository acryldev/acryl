// Example: chat-command.basic
// Type:     chat-command
// Surfaces: tui web desktop
// Teaches:  a chat slash command: `ctx.commands.register({ name, description, handler })` on the `commands` service.
//           The user types `/hello-example some text` in the chat; the handler runs on the host WITHOUT calling the
//           model and returns `{ kind: 'success' | 'error', text }`, shown to the user. Register inside an effect so the
//           command disappears when the plugin unloads. Use it for actions (reload, export, toggle), not for output that
//           the model should see; use a tool for that. This is a different seam from `tuiCommands` (terminal overlays).
// Expect:   row ACTIVE once the `commands` service exists; `/hello-example` is listed for a session.
// Docs:     extending.chat-command
export const name = 'acryl-example-chat-command'
export const inject = ['commands']

export function apply(ctx) {
  ctx.effect(function* () {
    yield ctx.commands.register({
      name: 'hello-example',
      description: 'Say hello (example command)',
      // `invocation.rawInput` is the text after the command name; `invocation.signal` aborts a long handler.
      async handler(invocation) {
        const who = invocation.rawInput.trim() || 'world'
        return { kind: 'success', text: `Hello, ${who}!` }
      },
    })
  }, 'acryl-example-chat-command: /hello-example')
}
