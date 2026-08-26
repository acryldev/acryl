export type RestartClass = 'HOT' | 'WARM' | 'COLD'

export type ControlOperationState =
  | 'CREATED'
  | 'VALIDATING'
  | 'DENIED'
  | 'READY'
  | 'RUNNING'
  | 'CANCELLING'
  | 'SETTLING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'RECOVERABLE'
  | 'CANCELLED'

export interface ControlOperation<TResult = unknown> {
  readonly operationId: string
  readonly kind: string
  readonly profileKey: string
  readonly requestedAt: string
  readonly state: ControlOperationState
  readonly restartClass?: RestartClass
  readonly result?: TResult
  readonly error?: {
    readonly code: string
    readonly message: string
    readonly retryable: boolean
  }
}

export type AcrylExitClass =
  | 'success'
  | 'usage'
  | 'unavailable'
  | 'denied'
  | 'conflict'
  | 'failed'
  | 'interrupted'
