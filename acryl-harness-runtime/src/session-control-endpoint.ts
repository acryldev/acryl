import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  ACRYL_CONTROL_PROTOCOL_VERSION,
  AcrControlProtocolService,
  ActiveControlLeaseStore,
  type ControlEndpoint,
} from 'acryl-control'
import type { AcrylSessionBridge } from './session-bridge.ts'

export interface AcrylSessionControlEndpointOptions {
  readonly address: string
  readonly generationId: string
  readonly activeControlExpiresAfterMs?: number
}

export interface AcrylSessionControlEndpoint {
  readonly endpoint: ControlEndpoint
  /** Issue a non-durable, endpoint-scoped attachment credential. Native runtime credentials remain server-held. */
  issueToken(attachment: 'owner' | 'attached'): string
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

function token(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 64) throw new Error('invalid ACRYL session credential')
  return value
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
  const activeControl = new ActiveControlLeaseStore({
    expiresAfterMs: options.activeControlExpiresAfterMs ?? 15_000,
  })
  const tokenAuthorities = new Map<string, { readonly attachment: 'owner' | 'attached'; readonly leaseId?: string }>()
  const issueToken = (mode: 'owner' | 'attached'): string => {
    const credential = randomBytes(32).toString('hex')
    const lease = mode === 'owner' ? activeControl.acquire(credential) : undefined
    tokenAuthorities.set(
      credential,
      lease === undefined ? { attachment: mode } : { attachment: mode, leaseId: lease.id },
    )
    return credential
  }
  const authorizeMutation = (credential: string): void => {
    const authority = tokenAuthorities.get(credential)
    if (authority?.attachment !== 'owner' || authority.leaseId === undefined) {
      throw new Error('ACRYL attached clients are read-only')
    }
    if (!activeControl.authorize(authority.leaseId)) {
      throw new Error('ACRYL active control lease has expired; authenticate again')
    }
  }
  const fiber = ctx.plugin(AcrControlProtocolService, {
    endpoint,
    generationId: options.generationId,
    capabilities: ['session.snapshot', 'session.prompt.submit', 'session.cancel'],

    async handle(operation: string, payload: unknown): Promise<unknown> {
      const input = record(payload)
      const sessionId = string(input.sessionId, 'session id')
      const credential = token(input.token)
      const authority = tokenAuthorities.get(credential)
      if (authority === undefined) throw new Error('invalid ACRYL session credential')
      switch (operation) {
        case 'session.snapshot': return Object.freeze({ ...(await bridge.snapshot(sessionId)), attachment: authority.attachment })
        case 'session.prompt.submit':
          authorizeMutation(credential)
          await bridge.submitPrompt({ sessionId, text: string(input.text, 'prompt') })
          return null
        case 'session.cancel':
          authorizeMutation(credential)
          await bridge.cancel(sessionId)
          return null
        default: throw new Error(`unsupported ACRYL session operation ${operation}`)
      }
    },
  })
  await fiber
  return Object.freeze({
    endpoint,
    issueToken,
    async dispose(): Promise<void> {
      tokenAuthorities.clear()
      await fiber.dispose()
    },
  })
}
