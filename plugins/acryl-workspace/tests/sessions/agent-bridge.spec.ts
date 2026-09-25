import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { describe, expect, it, vi } from 'vitest'
import { createAgentBridge } from '../../src/client/sessions/agent-bridge.ts'

interface FakeOptions {
  readonly current?: string | undefined
  readonly hasScope?: boolean
  readonly hasFace?: boolean
  readonly result?: { ok: true } | { ok: false; error: unknown }
  readonly throws?: Error
}

/** Test seam: the real service is a large interface; the bridge touches four members. */
function fakeSessions(options: FakeOptions = {}): { sessions: ISessions; prompt: ReturnType<typeof vi.fn> } {
  const prompt = vi.fn(async () => {
    if (options.throws !== undefined) throw options.throws
    return options.result ?? { ok: true, value: { accepted: true } }
  })
  const face = { prompt }
  const sessions = {
    list: { getSnapshot: () => ({ current: 'current' in options ? options.current : 's1' }) },
    scope: () => (options.hasScope === false ? undefined : { scope: true }),
    sessionOf: () => (options.hasFace === false ? undefined : face),
  } as unknown as ISessions
  return { sessions, prompt }
}

describe('createAgentBridge', () => {
  it('queues the text as a user turn on the current session', async () => {
    const { sessions, prompt } = fakeSessions()
    const result = await createAgentBridge(() => sessions).sendToCurrentSession('hello')
    expect(result).toEqual({ ok: true })
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }], 'queue')
  })

  it('says why when the service, the chat, the scope or the session face is missing', async () => {
    expect(await createAgentBridge(() => undefined).sendToCurrentSession('x'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('not available') })
    expect(await createAgentBridge(() => fakeSessions({ current: undefined }).sessions).sendToCurrentSession('x'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('open a chat first') })
    expect(await createAgentBridge(() => fakeSessions({ hasScope: false }).sessions).sendToCurrentSession('x'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('not ready') })
    expect(await createAgentBridge(() => fakeSessions({ hasFace: false }).sessions).sendToCurrentSession('x'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('not ready') })
  })

  it('reports a refused prompt with its message, or a generic one', async () => {
    const refused = fakeSessions({ result: { ok: false, error: { message: 'rate limited' } } })
    expect(await createAgentBridge(() => refused.sessions).sendToCurrentSession('x'))
      .toEqual({ ok: false, reason: 'rate limited' })
    const opaque = fakeSessions({ result: { ok: false, error: 42 } })
    expect(await createAgentBridge(() => opaque.sessions).sendToCurrentSession('x'))
      .toEqual({ ok: false, reason: 'the agent did not accept the message' })
  })

  it('turns a thrown error into a failure result instead of rejecting', async () => {
    const { sessions } = fakeSessions({ throws: new Error('socket closed') })
    expect(await createAgentBridge(() => sessions).sendToCurrentSession('x'))
      .toEqual({ ok: false, reason: 'socket closed' })
  })
})
