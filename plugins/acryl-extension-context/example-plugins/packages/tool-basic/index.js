// Example: tool.basic
// Type:     tool
// Surfaces: tui web desktop
// Teaches:  a tool is a plugin that injects `tools` and registers a defineTool() definition the model can call.
// Expect:   ACTIVE; the model sees the `example_echo` tool.
// Docs:     extending.tool
// Pattern:  deepseek-harness docs/cookbook/adding-a-tool.md
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'acryl-example-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_echo',
    description: 'Echo a message back, uppercased.',
    parameters: {
      message: { type: 'string', required: true, description: 'Text to echo' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      return args.message.toUpperCase()
    },
  }))
}
