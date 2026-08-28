import { describe, expect, it } from 'vitest'
import {
  createAcrylSessionClient,
  type AcrylSessionTransport,
} from '../src/protocol/client.ts'

function transport(overrides: Partial<AcrylSessionTransport> = {}): AcrylSessionTransport {
  return {
    request: async (operation, payload) => {
      if (operation === 'session.snapshot') {
        return {
          profile: 'acryl',
          generationId: 'generation-1',
          attachment: 'attached',
          sessionId: (payload as { sessionId: string }).sessionId,
          agentStatus: 'idle',
          transcript: [],
          tools: [],
        }
      }
      return null
    },
    subscribe: async (_operation, _payload, listener) => {
      listener({
        profile: 'acryl',
        generationId: 'generation-1',
        attachment: 'attached',
        sessionId: 'session-1',
        agentStatus: 'idle',
        transcript: [],
        tools: [],
      })
      return { dispose: async () => undefined }
    },
    ...overrides,
  }
}

describe('createAcrylSessionClient', () => {
  it('validates session snapshots received from the control transport', async () => {
    const client = createAcrylSessionClient(transport())

    await expect(client.snapshot('session-1')).resolves.toMatchObject({
      sessionId: 'session-1',
      attachment: 'attached',
    })
  })

  it('sends typed prompt and cancellation commands through the control transport', async () => {
    const calls: Array<{ operation: string; payload: unknown }> = []
    const client = createAcrylSessionClient(transport({
      request: async (operation, payload) => {
        calls.push({ operation, payload })
        return null
      },
    }))

    await client.submitPrompt({
      sessionId: 'session-1',
      text: 'Hello',
      clientCommandId: 'command-1',
    })
    await client.cancel({ sessionId: 'session-1' })

    expect(calls).toEqual([
      {
        operation: 'session.prompt.submit',
        payload: { sessionId: 'session-1', text: 'Hello', clientCommandId: 'command-1' },
      },
      { operation: 'session.cancel', payload: { sessionId: 'session-1' } },
    ])
  })
})
