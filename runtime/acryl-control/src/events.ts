import type { Context } from '@deepseek-ai/cordis'
import type { ControlOperation } from './contracts/operations.ts'

export interface AgentRuntimeStatusEvent {
  readonly runtimeId: string
  readonly providerId: string
  readonly status: 'idle' | 'running' | 'waiting' | 'stopping' | 'stopped' | 'failed'
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'acryl/operation-settled'(operation: ControlOperation): void
    'acryl/agent-runtime-status'(status: AgentRuntimeStatusEvent): void
  }
}

export type { Context }
