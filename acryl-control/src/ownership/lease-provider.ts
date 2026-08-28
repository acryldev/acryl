import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  ProfileLeaseAcquisition,
  ProfileLeaseRequest,
  ProfileOwnershipLease,
  StaleLeaseRecovery,
} from '../contracts/ownership.ts'
import {
  ProfileLeaseStore,
  type ProfileLeaseStoreOptions,
} from './lease-store.ts'

export interface AcrProfileOwnership {
  readonly current: ProfileLeaseAcquisition
  recoverStale(profileKey: string): Promise<StaleLeaseRecovery>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrProfileOwnership: AcrProfileOwnership
  }
}

export interface AcrProfileOwnershipBootstrap extends ProfileLeaseStoreOptions {
  readonly request: ProfileLeaseRequest
  /** A reservation acquired before boot so a contender never creates a second root. */
  readonly ownedLease?: ProfileOwnershipLease
  readonly heartbeatIntervalMs?: number
}

export class AcrProfileOwnershipService extends Service implements AcrProfileOwnership {
  private readonly store: ProfileLeaseStore
  private readonly request: ProfileLeaseRequest
  private acquisition: ProfileLeaseAcquisition | undefined
  private readonly ownedLease: ProfileOwnershipLease | undefined
  private readonly heartbeatIntervalMs: number
  private disposed = false

  constructor(ctx: Context, bootstrap: AcrProfileOwnershipBootstrap) {
    super(ctx, 'acrProfileOwnership')
    this.store = new ProfileLeaseStore(bootstrap)
    this.request = bootstrap.request
    this.ownedLease = bootstrap.ownedLease
    this.heartbeatIntervalMs = bootstrap.heartbeatIntervalMs ?? 5_000
    if (!Number.isFinite(this.heartbeatIntervalMs) || this.heartbeatIntervalMs <= 0) {
      throw new Error('profile lease heartbeat interval must be positive')
    }
    ctx.effect(() => {
      const timer = setInterval(() => { void this.heartbeat() }, this.heartbeatIntervalMs)
      return async () => {
        clearInterval(timer)
        this.disposed = true
        const acquisition = this.acquisition
        this.acquisition = undefined
        if (acquisition?.kind === 'owned') await this.store.release(acquisition.lease)
      }
    }, 'acryl-control: profile ownership lease')
  }

  async [Service.init](): Promise<void> {
    if (this.ownedLease !== undefined) {
      if (
        this.ownedLease.profileKey !== this.request.profileKey
        || this.ownedLease.ownerHostId !== this.request.host.hostId
        || this.ownedLease.generationId !== this.request.host.generationId
      ) {
        throw new Error('reserved profile lease does not match the host request')
      }
      this.acquisition = { kind: 'owned', lease: this.ownedLease }
      return
    }
    this.acquisition = await this.store.acquire(this.request)
  }

  private async heartbeat(): Promise<void> {
    const acquisition = this.acquisition
    if (this.disposed || acquisition?.kind !== 'owned') return
    try {
      this.acquisition = { kind: 'owned', lease: await this.store.heartbeat(acquisition.lease) }
    } catch {
      // The next guarded recovery owns a lost lease. A stale owner must not keep writing.
    }
  }

  get current(): ProfileLeaseAcquisition {
    if (this.disposed) throw new Error('acryl-control: profile ownership service disposed')
    if (this.acquisition === undefined) {
      throw new Error('acryl-control: profile ownership lease is not ready')
    }
    return this.acquisition
  }

  recoverStale(profileKey: string): Promise<StaleLeaseRecovery> {
    if (this.disposed) {
      return Promise.reject(new Error('acryl-control: profile ownership service disposed'))
    }
    return this.store.recoverStale(profileKey)
  }
}

export default AcrProfileOwnershipService
