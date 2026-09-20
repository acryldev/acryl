// Example: llm-adapter.echo
// Type:     llm-adapter
// Surfaces: tui web desktop
// Teaches:  the LlmAdapter contract: a class with `async * stream(options)` yielding StreamChunks, registered on
//           `ctx.llm.registerAdapter(['route'], adapter)`. Order: block-start, text-delta, block-end, then `usage`
//           BEFORE `finish`, and nothing after `finish`. Honor options.signal. A real provider would call its HTTP
//           API here; this one echoes the last user message so the contract can be seen without a network.
// Expect:   row ACTIVE once the `llm` service exists; provider route "acryl-echo" is registered.
// Docs:     extending.llm-adapter
// Pattern:  docs/reference/cookbook/adding-an-llm-adapter.md
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const name = 'acryl-example-llm-echo'
export const inject = ['llm']

const lastUserText = messages => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const blocks = Array.isArray(message.content) ? message.content : [{ type: 'text', text: String(message.content) }]
    return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
  }
  return ''
}

class EchoAdapter extends LlmAdapter {
  async * stream(options) {
    if (options.signal?.aborted) return
    const text = `echo: ${lastUserText(options.messages)}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    // usage BEFORE finish; nothing after finish.
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  // Effect-based registration: the route is released when this plugin is disposed or reloaded.
  ctx.llm.registerAdapter(['acryl-echo'], new EchoAdapter())
}
