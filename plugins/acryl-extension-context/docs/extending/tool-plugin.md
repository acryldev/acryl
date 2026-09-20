# Tool plugins: give the agent a new capability

A tool is a plugin that injects `tools` and registers a definition the model can call.
Example: `../examples/packages/tool-basic/`.

```js
import { defineTool } from '@deepseek-ai/dsh-tools'
export const name = 'my-tool'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'my_tool', description: 'What the model sees.',
    parameters: { path: { type: 'string', required: true, description: '...' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args, exec) { /* args are validated and typed; honor exec.signal */ return 'result' },
  }))
}
```

Rules: arguments are validated for you; `execute` returns one JSON-serializable value matching
`output.schema`; a throw becomes a tool error; cancel work when `exec.signal` aborts; keep
`presentCall`/`presentResult` (UI cards) pure. Registration is an effect: disposing the plugin
unregisters the tool. Full contract: `reference/cookbook/adding-a-tool.md`.
The package needs `@deepseek-ai/dsh-tools` as a dependency.
