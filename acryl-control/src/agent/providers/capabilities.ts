/** Truthful generation-scoped capability declarations per provider kind. */

import type { AgentCapability, AgentFidelity } from '../agent-control.ts'

export type AgentProviderKind = 'dsh-native' | 'codex' | 'claude' | 'acp'

export interface ProviderCapabilityProfile {
  readonly kind: AgentProviderKind
  readonly fidelity: AgentFidelity
  readonly capabilities: readonly AgentCapability[]
}

function capabilities(...items: AgentCapability[]): readonly AgentCapability[] {
  return Object.freeze(items)
}

/**
 * Declared capability sets. A provider must only claim what its transport can
 * truthfully support; unsupported commands are rejected before dispatch.
 */
export const PROVIDER_CAPABILITIES: Readonly<Record<AgentProviderKind, ProviderCapabilityProfile>> = {
  'dsh-native': Object.freeze({
    kind: 'dsh-native',
    fidelity: 'native',
    capabilities: capabilities(
      'agent.start',
      'agent.stop',
      'agent.send',
      'agent.cancel',
      'agent.resume',
      'agent.snapshot',
      'output.structured',
      'tool.calls',
      'approval.respond',
    ),
  }),
  codex: Object.freeze({
    kind: 'codex',
    fidelity: 'structured',
    capabilities: capabilities(
      'agent.start',
      'agent.stop',
      'agent.send',
      'agent.cancel',
      'agent.snapshot',
      'output.structured',
      'tool.calls',
    ),
  }),
  claude: Object.freeze({
    kind: 'claude',
    fidelity: 'structured',
    capabilities: capabilities(
      'agent.start',
      'agent.stop',
      'agent.send',
      'agent.cancel',
      'agent.snapshot',
      'output.structured',
      'tool.calls',
    ),
  }),
  acp: Object.freeze({
    kind: 'acp',
    fidelity: 'structured',
    capabilities: capabilities(
      'agent.start',
      'agent.stop',
      'agent.send',
      'agent.cancel',
      'agent.resume',
      'agent.snapshot',
      'output.structured',
      'tool.calls',
    ),
  }),
}
