# LLM adapters: connect a new model provider

Use this to add a provider route (a new hosted API, a local server, a wrapper). Working example:
`../example-plugins/packages/llm-adapter-echo/` (a network-free adapter that shows the whole contract; read it fully).
The complete contract: `reference/cookbook/adding-an-llm-adapter.md` and `reference/subsystems/llm-streaming.md`.

## The shape

```js
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
class MyAdapter extends LlmAdapter { async * stream(options) { /* yield StreamChunks */ } }
export const name = 'my-llm'
export const inject = ['llm']
export function apply(ctx) { ctx.llm.registerAdapter(['my-provider'], new MyAdapter()) }
```

Registration is effect-based (released on dispose or reload). One adapter per provider route: a duplicate
throws. `options.provider` picks the adapter and `options.model` is the provider's model id.

## Stream protocol (obligations)

Chunk order for a text answer: `block-start {index, blockType:'text'}`, one or more `text-delta {index, text}`,
`block-end {index, block:{type:'text', text}}`, then `usage {usage:{inputTokens, outputTokens}}`, then
`finish {reason:{kind:'stop'}}`. Emit `usage` BEFORE `finish` and nothing AFTER `finish`.

- Tool calls stream as `tool-call-delta {index, id, name?, argumentsDelta}` where `argumentsDelta` is a raw JSON
  string fragment; close with `block-end` and finish with `{kind:'tool-calls'}`.
- Reasoning text uses `reasoning-delta`.
- Honor `options.signal` (pass it to fetch). Never swallow an abort.
- Errors: THROW from `stream()` with `LlmError` and a stable code, or end with `finish {kind:'error'|'aborted', failure}`.
- Secrets come from validated `Config` with env fallbacks, never from a file read in code; never log a key.
- Every provider HTTP request must carry `attributionHeaders()` from `@deepseek-ai/dsh-llm`.
- Optional overrides: `providerInfo`, `listModels`, `resolveModel` (context window, reasoning efforts).

## Verify

Mount it, then check `ctx.llm` has the route. To exercise it without a network, run one `stream()` call in a
throwaway script and check the chunk order. Ask the user to pick the provider in Settings to try it for real.
