import { describe, it } from 'vitest'

describe('DeepSeek streaming tool calls', () => {
  // The 0.1.5 guard mocked the chat-completions SSE wire format and checked that a continuation delta with empty `id`/`name` strings
  // does not overwrite the first non-empty ones. `dsh-llm-deepseek` 0.2 talks to DeepSeek over a Messages transport, so that stream
  // never reaches the code the guard covered (spec 001 R25). Write the same guard against the Messages stream's tool-call deltas.
  it.todo('keeps the first non-empty id and name when continuation deltas contain empty strings (Messages transport)')
})
