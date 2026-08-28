import { createConnection } from 'node:net'
import type { ControlEndpoint } from '../contracts/control-protocol.ts'
import type { AcrylSessionAttachment, AcrylSessionClient } from '../contracts/session.ts'
import { createAcrylSessionClient, type AcrylSessionTransport } from './client.ts'

function request(endpoint: ControlEndpoint, generationId: string, operation: string, payload: unknown): Promise<unknown> {
  if (endpoint.kind !== 'unix') return Promise.reject(new Error('ACRYL session endpoint kind is not supported'))
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint.address)
    let buffer = ''
    socket.once('error', reject)
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ generationId, operation, payload })}\n`)
    })
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      socket.destroy()
      try {
        const envelope: unknown = JSON.parse(buffer.slice(0, newline))
        if (typeof envelope !== 'object' || envelope === null || !('ok' in envelope)) throw new Error('invalid ACRYL endpoint response')
        const record = envelope as { ok: boolean; result?: unknown; error?: { message?: unknown } }
        if (!record.ok) throw new Error(typeof record.error?.message === 'string' ? record.error.message : 'ACRYL endpoint request failed')
        resolve(record.result)
      } catch (error: unknown) {
        reject(error)
      }
    })
  })
}

/** Create a local endpoint client without exposing runtime-native objects. */
export function createAcrylEndpointSessionClient(
  endpoint: ControlEndpoint,
  generationId: string,
  attachment: AcrylSessionAttachment,
): AcrylSessionClient {
  const transport: AcrylSessionTransport = {
    request: (operation, payload) => request(endpoint, generationId, operation, {
      attachment,
      ...(payload as Record<string, unknown>),
    }),
    async subscribe(operation, payload, listener) {
      let disposed = false
      const poll = async (): Promise<void> => {
        if (disposed) return
        try {
          listener(await request(endpoint, generationId, operation === 'session.subscribe' ? 'session.snapshot' : operation, {
            attachment,
            ...(payload as Record<string, unknown>),
          }))
        } catch {}
      }
      await poll()
      const timer = setInterval(() => { void poll() }, 25)
      return { async dispose() { disposed = true; clearInterval(timer) } }
    },
  }
  return createAcrylSessionClient(transport)
}
