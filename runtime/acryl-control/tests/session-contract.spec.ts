import { describe, expect, it } from 'vitest'
import { parseAcrylSessionSnapshot } from '../src/contracts/session.ts'

describe('parseAcrylSessionSnapshot', () => {
  it('accepts one durable transcript and compact tool projection', () => {
    expect(parseAcrylSessionSnapshot({
      profile: 'acryl',
      generationId: 'generation-1',
      attachment: 'owner',
      sessionId: 'session-1',
      agentStatus: 'idle',
      transcript: [{ id: 'message-1', author: 'user', text: 'Hello' }],
      tools: [{ callId: 'call-1', name: 'read', status: 'succeeded' }],
    })).toEqual({
      profile: 'acryl',
      generationId: 'generation-1',
      attachment: 'owner',
      sessionId: 'session-1',
      agentStatus: 'idle',
      transcript: [{ id: 'message-1', author: 'user', text: 'Hello' }],
      tools: [{ callId: 'call-1', name: 'read', status: 'succeeded' }],
    })
  })

  it('accepts an optional provider binding and validates it when present', () => {
    const provider = {
      providerId: 'acp',
      workerId: 'worker-1',
      runtimeId: 'runtime-1',
      providerSessionRef: 'acp-session-1',
      status: 'idle',
    }
    expect(parseAcrylSessionSnapshot({
      profile: 'acryl',
      generationId: 'generation-1',
      attachment: 'owner',
      sessionId: 'worker-1',
      agentStatus: 'idle',
      transcript: [],
      tools: [],
      provider,
    })).toMatchObject({ provider })

    expect(() => parseAcrylSessionSnapshot({
      profile: 'acryl',
      generationId: 'generation-1',
      attachment: 'owner',
      sessionId: 'worker-1',
      agentStatus: 'idle',
      transcript: [],
      tools: [],
      provider: { ...provider, status: 'bogus' },
    })).toThrow('invalid ACRYL provider status')
  })

  it('rejects malformed external snapshot values', () => {
    expect(() => parseAcrylSessionSnapshot({
      profile: 'acryl',
      generationId: 'generation-1',
      attachment: 'owner',
      sessionId: 'session-1',
      agentStatus: 'idle',
      transcript: [{ id: 'message-1', author: 'system', text: 'invalid' }],
      tools: [],
    })).toThrow('invalid ACRYL transcript author')
  })
})
