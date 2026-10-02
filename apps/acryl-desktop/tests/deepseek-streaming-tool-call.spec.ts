import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekAdapter } from '@deepseek-ai/dsh-llm-deepseek'

// `dsh-llm-deepseek` 0.2 talks to DeepSeek over a Messages transport (spec 001 R25). The 0.1.5 guard covered chat-completions
// continuation deltas with empty id/name; this one pins the same invariant on the Messages stream: a tool_use block keeps its id and
// name across input_json_delta events, and the arguments are the joined partial JSON.
function sse(events: readonly Record<string, unknown>[]): Response {
  const body = events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function adapter(): DeepSeekAdapter {
  const connection = {
    baseURL: 'https://api.deepseek.test/anthropic',
    defaults: {},
    maxTokens: 1024,
    defaultContextWindow: 128_000,
    models: [],
    streamIdleTimeoutMs: 5_000,
    maxRequestFilesBytes: 0,
    maxInlineRequestImageBytes: 0,
    maxImagesPerRequest: 0,
    imageOffloadByteQuantum: 1,
    inlineImageOffloadByteQuantum: 1,
    imageOffloadCountQuantum: 1,
    filesApiTimeoutMs: 1_000,
    filePolicy: {},
    retryPolicy: {},
  }
  return new DeepSeekAdapter({
    options: () => connection,
    resolveAuth: async () => ({ headers: { 'x-api-key': 'test-key' } }),
    resolveUserId: () => 'test-user',
    prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
  } as never)
}

describe('DeepSeek streaming tool calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the tool_use id and name across input_json_delta events and joins the arguments (Messages transport)', async () => {
    vi.stubGlobal('fetch', async () =>
      sse([
        { type: 'message_start', message: { usage: { input_tokens: 3, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'read_file', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.ts"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ]),
    )

    const events: Record<string, unknown>[] = []
    for await (const event of adapter().stream({
      provider: 'deepseek',
      model: 'deepseek-v4',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'read a.ts' }] }],
    } as never) as AsyncIterable<Record<string, unknown>>) {
      events.push(event)
    }

    const deltas = events.filter((event) => event.type === 'tool-call-delta')
    expect(deltas.length).toBeGreaterThan(1)
    for (const delta of deltas) expect(delta.id).toBe('call_1')
    expect(events.find((event) => event.type === 'block-end')).toMatchObject({
      block: { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}' },
    })
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
  })
})
