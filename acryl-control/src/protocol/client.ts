import {
  parseAcrylSessionSnapshot,
  type AcrylSessionClient,
  type AcrylSessionSnapshot,
  type AcrylSessionSubscription,
} from '../contracts/session.ts'

export interface AcrylSessionTransport {
  request(operation: string, payload: unknown): Promise<unknown>
  subscribe(
    operation: string,
    payload: unknown,
    listener: (value: unknown) => void,
  ): Promise<AcrylSessionSubscription>
}

function sessionId(value: string): string {
  if (value.trim() === '') throw new Error('ACRYL session id must not be empty')
  return value
}

function prompt(input: { readonly text: string }): string {
  if (input.text.trim() === '') throw new Error('ACRYL prompt must not be empty')
  return input.text
}

/** Create the presentation-safe session client over an owner or attached transport. */
export function createAcrylSessionClient(transport: AcrylSessionTransport): AcrylSessionClient {
  return Object.freeze({
    async snapshot(value: string): Promise<AcrylSessionSnapshot> {
      return parseAcrylSessionSnapshot(await transport.request('session.snapshot', {
        sessionId: sessionId(value),
      }))
    },
    async subscribe(
      value: string,
      listener: (snapshot: AcrylSessionSnapshot) => void,
    ): Promise<AcrylSessionSubscription> {
      const selectedSessionId = sessionId(value)
      return transport.subscribe('session.subscribe', { sessionId: selectedSessionId }, (snapshot) => {
        const parsed = parseAcrylSessionSnapshot(snapshot)
        if (parsed.sessionId !== selectedSessionId) {
          throw new Error('ACRYL subscription returned a different session')
        }
        listener(parsed)
      })
    },
    async submitPrompt(input: {
      readonly sessionId: string
      readonly text: string
      readonly clientCommandId: string
    }): Promise<void> {
      await transport.request('session.prompt.submit', {
        sessionId: sessionId(input.sessionId),
        text: prompt(input),
        clientCommandId: nonEmptyCommandId(input.clientCommandId),
      })
    },
    async cancel(input: { readonly sessionId: string }): Promise<void> {
      await transport.request('session.cancel', { sessionId: sessionId(input.sessionId) })
    },
  })
}

function nonEmptyCommandId(value: string): string {
  if (value.trim() === '') throw new Error('ACRYL client command id must not be empty')
  return value
}
