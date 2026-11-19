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
