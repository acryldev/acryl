import type { Context } from '@deepseek-ai/cordis'
import {
  ACRYL_CONTROL_PROTOCOL_VERSION,
  AcrControlProtocolService,
  type ControlEndpoint,
} from 'acryl-control'
import type { AcrylSessionBridge } from './session-bridge.ts'

export interface AcrylSessionControlEndpointOptions {
  readonly address: string
  readonly generationId: string
}

export interface AcrylSessionControlEndpoint {
  readonly endpoint: ControlEndpoint
  dispose(): Promise<void>
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid ACRYL session endpoint payload')
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`ACRYL ${label} must not be empty`)
  return value
}

function attachment(value: unknown): 'owner' | 'attached' {
  if (value === 'owner' || value === 'attached') return value
  throw new Error('invalid ACRYL session attachment')
}

/** Mount the DSH-owning session adapter behind the transport-neutral control endpoint. */
export async function mountAcrylSessionControlEndpoint(
  ctx: Context,
  bridge: AcrylSessionBridge,
  options: AcrylSessionControlEndpointOptions,
): Promise<AcrylSessionControlEndpoint> {
  const endpoint: ControlEndpoint = {
    kind: 'unix',
    address: options.address,
    protocolVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
  }
  const fiber = ctx.plugin(AcrControlProtocolService, {
    endpoint,
    generationId: options.generationId,
    capabilities: ['session.snapshot', 'session.prompt.submit', 'session.cancel'],
    async handle(operation: string, payload: unknown): Promise<unknown> {
      const input = record(payload)
      const sessionId = string(input.sessionId, 'session id')
      const mode = attachment(input.attachment)
      switch (operation) {
        case 'session.snapshot': return Object.freeze({ ...(await bridge.snapshot(sessionId)), attachment: mode })
        case 'session.prompt.submit':
          if (mode !== 'owner') throw new Error('ACRYL attached clients are read-only')
          await bridge.submitPrompt({ sessionId, text: string(input.text, 'prompt') })
          return null
        case 'session.cancel':
          if (mode !== 'owner') throw new Error('ACRYL attached clients are read-only')
          await bridge.cancel(sessionId)
          return null
        default: throw new Error(`unsupported ACRYL session operation ${operation}`)
      }
    },
  })
  await fiber
  return Object.freeze({ endpoint, async dispose(): Promise<void> { await fiber.dispose() } })
}
