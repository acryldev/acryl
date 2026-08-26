export const ACRYL_CONTROL_PROTOCOL_VERSION = 1 as const

export type ControlEndpointKind = 'unix' | 'named-pipe' | 'loopback-http'

export interface ControlEndpoint {
  readonly kind: ControlEndpointKind
  readonly address: string
  readonly protocolVersion: typeof ACRYL_CONTROL_PROTOCOL_VERSION
}

export type ControlCapability =
  | 'host.status'
  | 'profile.inspect'
  | 'architecture.inspect'
  | 'plugin.lifecycle'
  | 'package.manage'
  | 'agent.control'
  | 'approval.respond'
  | 'host.restart'

export interface ControlSuccessEnvelope<T = unknown> {
  readonly schemaVersion: typeof ACRYL_CONTROL_PROTOCOL_VERSION
  readonly ok: true
  readonly operation: string
  readonly result: T
}

export interface ControlFailure {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly details?: unknown
}

export interface ControlFailureEnvelope {
  readonly schemaVersion: typeof ACRYL_CONTROL_PROTOCOL_VERSION
  readonly ok: false
  readonly operation: string
  readonly error: ControlFailure
}

export type ControlEnvelope<T = unknown> = ControlSuccessEnvelope<T> | ControlFailureEnvelope

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseControlEnvelope(raw: string): ControlEnvelope {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('invalid control envelope JSON')
  }
  if (!isRecord(value)) throw new Error('invalid control envelope')
  if (value.schemaVersion !== ACRYL_CONTROL_PROTOCOL_VERSION) {
    throw new Error('unsupported control envelope version')
  }
  if (typeof value.operation !== 'string' || value.operation.trim() === '') {
    throw new Error('invalid control envelope operation')
  }
  if (value.ok === true && Object.hasOwn(value, 'result')) {
    return {
      schemaVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
      ok: true,
      operation: value.operation,
      result: value.result,
    }
  }
  if (value.ok !== false || !isRecord(value.error)) {
    throw new Error('invalid control failure envelope')
  }
  const error = value.error
  if (
    typeof error.code !== 'string'
    || typeof error.message !== 'string'
    || typeof error.retryable !== 'boolean'
  ) {
    throw new Error('invalid control failure envelope')
  }
  const failure: ControlFailure = Object.hasOwn(error, 'details')
    ? {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
      }
    : {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      }
  return {
    schemaVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
    ok: false,
    operation: value.operation,
    error: failure,
  }
}
