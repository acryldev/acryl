// Example: client-tool-view.custom-card  (host half)
// Type:     tool + client-slot (a tool renderer)
// Surfaces: web desktop (the tool also works on the CLI, which has no custom renderers)
// Teaches:  a tool with its own conversation card. The host half registers the tool `example_word_stats`; the browser half (client.js) registers a
//           `tool.call.toolview` keyed by that SAME tool name, so the app draws its calls with your component instead of the generic tool row.
// Expect:   row ACTIVE; the model can call `example_word_stats`; in the chat its calls render as a card after a page reload.
// Docs:     extending.client-slot
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'acryl-example-tool-view'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_word_stats',
    description: 'Count the words and characters of a text. Returns JSON {"words": n, "chars": m}.',
    parameters: { text: { type: 'string', required: true, description: 'The text to measure' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const text = String(args.text)
      return JSON.stringify({ words: text.split(/\s+/u).filter(Boolean).length, chars: text.length })
    },
  }))
}
