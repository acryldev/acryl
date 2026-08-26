/** Provider-neutral agent-control service definition for ACRYL. */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'

export type AgentFidelity = 'native' | 'structured' | 'derived' | 'opaque-terminal'
export type AgentStatus = 'idle' | 'running' | 'waiting' | 'stopping' | 'stopped' | 'failed'

/** Canonical logical worker identity in the ACRYL room. */
export type AcrWorkerId = string
/** Identity for one live in-process agent, protocol connection, SDK run, or CLI process. */
export type AgentRuntimeId = string
/** Adapter-scoped opaque vendor session reference. */
export type ProviderSessionRef = string

/** Generation-scoped truthful provider capabilities. */
export type AgentCapability =
  | 'agent.start'
  | 'agent.stop'
  | 'agent.send'
  | 'agent.cancel'
  | 'agent.resume'
  | 'agent.snapshot'
  | 'output.structured'
  | 'output.terminal'
  | 'tool.calls'
  | 'approval.respond'

export interface AgentWorkspace {
  readonly identity: string
  readonly cwd: string
}

/** One bound worker as projected by the control service. */
export interface AgentSnapshot {
  readonly workerId: AcrWorkerId
  readonly runtimeId: AgentRuntimeId | null
  readonly providerId: string
  readonly providerSessionRef: ProviderSessionRef | null
  readonly harnessSessionId: string | null
  readonly workspace: AgentWorkspace | null
  readonly capabilities: readonly AgentCapability[]
  readonly fidelity: AgentFidelity
  readonly status: AgentStatus
}

export type AgentCommandKind = 'start' | 'send' | 'cancel' | 'stop' | 'resume'

export interface AgentCommand {
  readonly kind: AgentCommandKind
  readonly payload: unknown
}

export interface CommandReceipt {
  readonly accepted: true
  readonly workerId: AcrWorkerId
  readonly runtimeId: AgentRuntimeId
  readonly kind: AgentCommandKind
  readonly result: unknown
}

export interface AttachAgentRequest {
  readonly workerId: AcrWorkerId
  readonly providerId: string
  readonly workspace: AgentWorkspace | null
  readonly capabilities: readonly AgentCapability[]
  readonly fidelity: AgentFidelity
  readonly providerSessionRef?: ProviderSessionRef
  readonly harnessSessionId?: string
}

export interface AgentScope {
  readonly workerId?: AcrWorkerId
  readonly providerId?: string
}

/** Transport seam a provider delegates to; vendor SDKs plug in here (Phase 8). */
export interface AgentTransport {
  execute(binding: AgentSnapshot, command: AgentCommand, signal?: AbortSignal): Promise<unknown>
}

/** One registered adapter. Registration is a reversible effect. */
export interface AgentProvider {
  readonly id: string
  readonly fidelity: AgentFidelity
  readonly capabilities: readonly AgentCapability[]
  attach(request: AttachAgentRequest): Promise<AgentSnapshot>
  execute(binding: AgentSnapshot, command: AgentCommand, signal?: AbortSignal): Promise<unknown>
}

export interface AcrAgentControl {
  registerProvider(owner: Context, provider: AgentProvider): void
  attach(request: AttachAgentRequest): Promise<AgentSnapshot>
  dispatch(workerId: AcrWorkerId, command: AgentCommand, signal?: AbortSignal): Promise<CommandReceipt>
  snapshot(scope?: AgentScope): Promise<readonly AgentSnapshot[]>
}

export type AcrAgentControlErrorCode =
  | 'unknown-provider'
  | 'unknown-worker'
  | 'capability-rejected'
  | 'runtime-collision'
  | 'session-collision'
  | 'cancelled'
  | 'transport-unavailable'

export class AcrAgentControlError extends Error {
  constructor(readonly code: AcrAgentControlErrorCode, message: string) {
    super(message)
    this.name = 'AcrAgentControlError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrAgentControl: AcrAgentControl
  }
}

const COMMAND_CAPABILITY: Readonly<Record<AgentCommandKind, AgentCapability>> = {
  start: 'agent.start',
  send: 'agent.send',
  cancel: 'agent.cancel',
  stop: 'agent.stop',
  resume: 'agent.resume',
}

export class AcrAgentControlService extends Service implements AcrAgentControl {
  private readonly providers = new Map<string, AgentProvider>()
  private readonly bindings = new Map<AcrWorkerId, AgentSnapshot>()

  constructor(ctx: Context) {
    super(ctx, 'acrAgentControl')
  }

  registerProvider(owner: Context, provider: AgentProvider): void {
    if (provider.id.trim() === '') throw new Error('agent provider id must not be empty')
    owner.effect(() => {
      if (this.providers.has(provider.id)) {
        throw new Error(`duplicate agent provider id: ${provider.id}`)
      }
      this.providers.set(provider.id, provider)
      return () => {
        if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id)
      }
    }, `acryl-control: agent provider ${provider.id}`)
  }

  async attach(request: AttachAgentRequest): Promise<AgentSnapshot> {
    const provider = this.providers.get(request.providerId)
    if (provider === undefined) {
      throw new AcrAgentControlError('unknown-provider', `Unknown agent provider ${request.providerId}.`)
    }
    const declared = new Set(provider.capabilities)
    for (const capability of request.capabilities) {
      if (!declared.has(capability)) {
        throw new AcrAgentControlError(
          'capability-rejected',
          `Provider ${request.providerId} does not declare capability ${capability}.`,
        )
      }
    }
    const binding = await provider.attach(request)
    for (const existing of this.bindings.values()) {
      if (binding.runtimeId !== null && binding.runtimeId === existing.runtimeId) {
        throw new AcrAgentControlError('runtime-collision', `Runtime ${binding.runtimeId} is already bound.`)
      }
      if (
        binding.providerSessionRef !== null
        && binding.providerSessionRef === existing.providerSessionRef
        && binding.providerId !== existing.providerId
      ) {
        throw new AcrAgentControlError(
          'session-collision',
          `Provider session ${binding.providerSessionRef} is claimed by another provider.`,
        )
      }
    }
    this.bindings.set(binding.workerId, binding)
    return binding
  }

  async dispatch(
    workerId: AcrWorkerId,
    command: AgentCommand,
    signal?: AbortSignal,
  ): Promise<CommandReceipt> {
    const binding = this.bindings.get(workerId)
    if (binding === undefined) {
      throw new AcrAgentControlError('unknown-worker', `Unknown agent worker ${workerId}.`)
    }
    const required = COMMAND_CAPABILITY[command.kind]
    if (!binding.capabilities.includes(required)) {
      throw new AcrAgentControlError(
        'capability-rejected',
        `Worker ${workerId} does not declare capability ${required}.`,
      )
    }
    if (signal?.aborted) {
      throw new AcrAgentControlError('cancelled', `Command ${command.kind} was cancelled.`)
    }
    const provider = this.providers.get(binding.providerId)
    if (provider === undefined) {
      throw new AcrAgentControlError('unknown-provider', `Unknown agent provider ${binding.providerId}.`)
    }
    if (binding.runtimeId === null) {
      throw new AcrAgentControlError('unknown-worker', `Worker ${workerId} has no live runtime.`)
    }
    const result = await provider.execute(binding, command, signal)
    return Object.freeze({
      accepted: true,
      workerId,
      runtimeId: binding.runtimeId,
      kind: command.kind,
      result,
    })
  }

  async snapshot(scope?: AgentScope): Promise<readonly AgentSnapshot[]> {
    const bindings = [...this.bindings.values()]
    if (scope === undefined) return Object.freeze(bindings)
    return Object.freeze(bindings.filter((binding) => {
      if (scope.workerId !== undefined && binding.workerId !== scope.workerId) return false
      if (scope.providerId !== undefined && binding.providerId !== scope.providerId) return false
      return true
    }))
  }
}

export default AcrAgentControlService
