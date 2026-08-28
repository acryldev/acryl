import { createConnection } from 'node:net'
import type { ControlEndpoint } from '../contracts/control-protocol.ts'
import type { AcrylSessionClient } from '../contracts/session.ts'
import { createAcrylSessionClient, type AcrylSessionTransport } from './client.ts'

export const ENDPOINT_REQUEST_TIMEOUT_MS = 5_000
const POLLING_INTERVAL_MS = 25

function request(endpoint: ControlEndpoint, generationId: string, operation: string, payload: unknown): Promise<unknown> {
  if (endpoint.kind !== 'unix') return Promise.reject(new Error('ACRYL session endpoint kind is not supported'))
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint.address)
    let buffer = ''
    let settled = false
    const settle = (complete: () => void): void => {
      if (settled) return
      settled = true
      socket.destroy()
      complete()
    }
    socket.setTimeout(ENDPOINT_REQUEST_TIMEOUT_MS)
    socket.once('error', (error) => settle(() => reject(error)))
    socket.once('timeout', () => settle(() => reject(new Error('ACRYL endpoint request timed out'))))
    socket.once('close', () => {
      settle(() => reject(new Error('ACRYL endpoint closed before responding')))
    })
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ generationId, operation, payload })}\n`)
    })
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      try {
        const envelope: unknown = JSON.parse(buffer.slice(0, newline))
        if (typeof envelope !== 'object' || envelope === null || !('ok' in envelope)) throw new Error('invalid ACRYL endpoint response')
        const record = envelope as { ok: boolean; result?: unknown; error?: { message?: unknown } }
        if (!record.ok) throw new Error(typeof record.error?.message === 'string' ? record.error.message : 'ACRYL endpoint request failed')
        settle(() => resolve(record.result))
      } catch (error: unknown) {
        settle(() => reject(error))
      }
    })
  })
}

/** Create a local endpoint client without exposing runtime-native objects. */
export function createAcrylEndpointSessionClient(
  endpoint: ControlEndpoint,
  generationId: string,
  token: string,
): AcrylSessionClient {
  const transport: AcrylSessionTransport = {
    request: (operation, payload) => request(endpoint, generationId, operation, {
      token,
      ...(payload as Record<string, unknown>),
    }),
    async subscribe(operation, payload, listener, onError) {
      let disposed = false
      let failed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let resolveError!: (error: Error) => void
      const whenError = new Promise<Error>((resolve) => { resolveError = resolve })
      const stop = (error: Error): void => {
        if (disposed || failed) return
        failed = true
        if (timer !== undefined) clearTimeout(timer)
        resolveError(error)
        try {
          onError?.(error)
        } catch {
          // Error observers cannot disrupt terminal subscription cleanup.
        }
      }
      const poll = async (): Promise<void> => {
        if (disposed || failed) return
        try {
          const value = await request(endpoint, generationId, operation === 'session.subscribe' ? 'session.snapshot' : operation, {
            token,
            ...(payload as Record<string, unknown>),
          })
          if (!disposed && !failed) {
            try {
              listener(value)
            } catch {
              // Presentation listeners cannot break transport polling.
            }
          }
        } catch (cause) {
          stop(cause instanceof Error ? cause : new Error(String(cause)))
        } finally {
          if (!disposed && !failed) timer = setTimeout(() => { void poll() }, POLLING_INTERVAL_MS)
        }
      }
      await poll()
      if (failed) {
        throw await whenError
      }
      return Object.freeze({
        whenError: () => whenError,
        async dispose() {
          if (disposed) return
          disposed = true
          if (timer !== undefined) clearTimeout(timer)
        },
      })
    },
  }
  return createAcrylSessionClient(transport)
}
