/** Shared provider plugin factory: registers a capability-declaring adapter. */

import type { Context } from '@deepseek-ai/cordis'
import {
  AcrAgentControlError,
  type AgentCommand,
  type AgentProvider,
  type AgentSnapshot,
  type AgentTransport,
  type AttachAgentRequest,
} from '../agent-control.ts'
import { PROVIDER_CAPABILITIES, type AgentProviderKind } from './capabilities.ts'

export interface ProviderPluginOptions {
  readonly kind: AgentProviderKind
  readonly transport?: AgentTransport
}

function snapshotOf(request: AttachAgentRequest): AgentSnapshot {
  return Object.freeze({
    workerId: request.workerId,
    runtimeId: null,
    providerId: request.providerId,
    providerSessionRef: request.providerSessionRef ?? null,
    harnessSessionId: request.harnessSessionId ?? null,
    workspace: request.workspace,
    capabilities: Object.freeze([...request.capabilities]),
    fidelity: request.fidelity,
    status: 'idle',
  })
}

/**
 * Create a provider plugin for one vendor. The transport is the Phase 8 seam;
 * until one is supplied, `execute` rejects honestly with `transport-unavailable`.
 */
export function createProviderPlugin(options: ProviderPluginOptions) {
  const profile = PROVIDER_CAPABILITIES[options.kind]
  return {
    name: `acryl-agent-${profile.kind}`,
    inject: ['acrAgentControl'] as const,
    apply(ctx: Context) {
      const provider: AgentProvider = {
        id: profile.kind,
        fidelity: profile.fidelity,
        capabilities: profile.capabilities,
        async attach(request: AttachAgentRequest): Promise<AgentSnapshot> {
          return snapshotOf(request)
        },
        async execute(binding: AgentSnapshot, command: AgentCommand, signal?: AbortSignal) {
          if (options.transport === undefined) {
            throw new AcrAgentControlError(
              'transport-unavailable',
              `Provider ${profile.kind} has no transport wired.`,
            )
          }
          return options.transport.execute(binding, command, signal)
        },
      }
      ctx.acrAgentControl.registerProvider(ctx, provider)
    },
  }
}
