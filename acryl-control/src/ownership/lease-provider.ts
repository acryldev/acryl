import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  ProfileLeaseAcquisition,
  ProfileLeaseRequest,
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
}

export class AcrProfileOwnershipService extends Service implements AcrProfileOwnership {
  private readonly store: ProfileLeaseStore
  private readonly request: ProfileLeaseRequest
  private acquisition: ProfileLeaseAcquisition | undefined
  private disposed = false

  constructor(ctx: Context, bootstrap: AcrProfileOwnershipBootstrap) {
    super(ctx, 'acrProfileOwnership')
    this.store = new ProfileLeaseStore(bootstrap)
    this.request = bootstrap.request
    ctx.effect(() => async () => {
      this.disposed = true
      const acquisition = this.acquisition
      if (acquisition?.kind === 'owned') await this.store.release(acquisition.lease)
      this.acquisition = undefined
    }, 'acryl-control: profile ownership lease')
  }

  async [Service.init](): Promise<void> {
    this.acquisition = await this.store.acquire(this.request)
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
