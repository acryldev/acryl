import type { ControlEndpoint } from './control-protocol.ts'

export type HostKind = 'tui' | 'gui' | 'web'
export type HostStatus = 'starting' | 'ready' | 'stopping' | 'failed'

export interface HostInstance {
  readonly hostId: string
  readonly kind: HostKind
  readonly generationId: string
  readonly pid: number
  readonly startedAt: string
  readonly protocolVersion: number
  readonly status: HostStatus
}

export interface ProfileLeaseRequest {
  readonly profileKey: string
  readonly host: HostInstance
  readonly endpoint: ControlEndpoint
}

export interface ProfileOwnershipLease {
  readonly schemaVersion: 1
  readonly profileKey: string
  readonly ownerHostId: string
  readonly ownerKind: HostKind
  readonly generationId: string
  readonly pid: number
  readonly endpoint: ControlEndpoint
  readonly protocolVersion: number
  readonly issuedAt: string
  readonly heartbeatAt: string
  readonly nonce: string
}

export type ProfileLeaseAcquisition =
  | { readonly kind: 'owned'; readonly lease: ProfileOwnershipLease }
  | { readonly kind: 'attached'; readonly lease: ProfileOwnershipLease }

export type StaleLeaseRecovery =
  | { readonly kind: 'unowned' }
  | { readonly kind: 'active'; readonly lease: ProfileOwnershipLease }
  | { readonly kind: 'recovered'; readonly lease: ProfileOwnershipLease }
