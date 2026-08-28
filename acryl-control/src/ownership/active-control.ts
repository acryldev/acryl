import { randomUUID } from 'node:crypto'

export interface ActiveControlLease {
  readonly id: string
  readonly controllerId: string
  readonly generationId: string
  readonly issuedAt: string
  readonly heartbeatAt: string
}

export interface ActiveControlLeaseStoreOptions {
  readonly now?: () => Date
  readonly expiresAfterMs: number
  readonly createId?: () => string
}

/** In-memory authority for the sole peer permitted to mutate one live endpoint. */
export class ActiveControlLeaseStore {
  readonly #now: () => Date
  readonly #expiresAfterMs: number
  readonly #createId: () => string
  #lease: ActiveControlLease | undefined

  constructor(options: ActiveControlLeaseStoreOptions) {
    if (!Number.isFinite(options.expiresAfterMs) || options.expiresAfterMs <= 0) {
      throw new Error('active control lease expiry must be positive')
    }
    this.#now = options.now ?? (() => new Date())
    this.#expiresAfterMs = options.expiresAfterMs
    this.#createId = options.createId ?? randomUUID
  }

  acquire(controllerId: string, generationId = this.#createId()): ActiveControlLease {
    if (controllerId.trim() === '') throw new Error('active controller id must not be empty')
    const timestamp = this.#now().toISOString()
    const lease = Object.freeze({
      id: this.#createId(),
      controllerId,
      generationId,
      issuedAt: timestamp,
      heartbeatAt: timestamp,
    })
    this.#lease = lease
    return lease
  }

  active(): ActiveControlLease | undefined {
    const lease = this.#lease
    if (lease === undefined || this.expired(lease)) {
      this.#lease = undefined
      return undefined
    }
    return lease
  }

  authorize(leaseId: string): boolean {
    return this.active()?.id === leaseId
  }

  heartbeat(lease: ActiveControlLease): ActiveControlLease {
    const active = this.active()
    if (
      active === undefined
      || active.id !== lease.id
      || active.generationId !== lease.generationId
      || active.controllerId !== lease.controllerId
    ) {
      throw new Error('active control lease does not match')
    }
    const renewed = Object.freeze({ ...active, heartbeatAt: this.#now().toISOString() })
    this.#lease = renewed
    return renewed
  }

  release(lease: ActiveControlLease): void {
    if (this.authorize(lease.id)) this.#lease = undefined
  }

  private expired(lease: ActiveControlLease): boolean {
    return this.#now().getTime() - Date.parse(lease.heartbeatAt) >= this.#expiresAfterMs
  }
}
