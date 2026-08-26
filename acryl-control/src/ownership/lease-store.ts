import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

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

export interface ControlEndpoint {
  readonly kind: 'unix' | 'named-pipe' | 'loopback-http'
  readonly address: string
  readonly protocolVersion: number
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

export interface ProfileLeaseStoreOptions {
  readonly stateDirectory: string
  readonly now?: () => Date
  readonly createNonce?: () => string
}

function leaseDirectoryName(profileKey: string): string {
  return `${createHash('sha256').update(profileKey).digest('hex')}.lease`
}

function isAlreadyOwnedError(cause: unknown): boolean {
  if (!(cause instanceof Error) || !('code' in cause)) return false
  return cause.code === 'EEXIST' || cause.code === 'ENOTEMPTY'
}

function parseLease(raw: string): ProfileOwnershipLease {
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null) throw new Error('invalid profile lease record')
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1
    || typeof record.profileKey !== 'string'
    || typeof record.ownerHostId !== 'string'
    || (record.ownerKind !== 'tui' && record.ownerKind !== 'gui' && record.ownerKind !== 'web')
    || typeof record.generationId !== 'string'
    || typeof record.pid !== 'number'
    || typeof record.protocolVersion !== 'number'
    || typeof record.issuedAt !== 'string'
    || typeof record.heartbeatAt !== 'string'
    || typeof record.nonce !== 'string'
    || typeof record.endpoint !== 'object'
    || record.endpoint === null
  ) {
    throw new Error('invalid profile lease record')
  }
  const endpoint = record.endpoint as Record<string, unknown>
  if (
    (endpoint.kind !== 'unix' && endpoint.kind !== 'named-pipe' && endpoint.kind !== 'loopback-http')
    || typeof endpoint.address !== 'string'
    || typeof endpoint.protocolVersion !== 'number'
  ) {
    throw new Error('invalid profile lease endpoint')
  }
  return {
    schemaVersion: 1,
    profileKey: record.profileKey,
    ownerHostId: record.ownerHostId,
    ownerKind: record.ownerKind,
    generationId: record.generationId,
    pid: record.pid,
    endpoint: {
      kind: endpoint.kind,
      address: endpoint.address,
      protocolVersion: endpoint.protocolVersion,
    },
    protocolVersion: record.protocolVersion,
    issuedAt: record.issuedAt,
    heartbeatAt: record.heartbeatAt,
    nonce: record.nonce,
  }
}

async function removeCandidate(directory: string): Promise<void> {
  try {
    await unlink(join(directory, 'lease.json'))
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause
  }
  try {
    await rmdir(directory)
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause
  }
}

export class ProfileLeaseStore {
  readonly #stateDirectory: string
  readonly #now: () => Date
  readonly #createNonce: () => string

  constructor(options: ProfileLeaseStoreOptions) {
    this.#stateDirectory = options.stateDirectory
    this.#now = options.now ?? (() => new Date())
    this.#createNonce = options.createNonce ?? randomUUID
  }

  async acquire(request: ProfileLeaseRequest): Promise<ProfileLeaseAcquisition> {
    if (request.profileKey.trim() === '') throw new Error('profile key must not be empty')
    const timestamp = this.#now().toISOString()
    const lease: ProfileOwnershipLease = {
      schemaVersion: 1,
      profileKey: request.profileKey,
      ownerHostId: request.host.hostId,
      ownerKind: request.host.kind,
      generationId: request.host.generationId,
      pid: request.host.pid,
      endpoint: request.endpoint,
      protocolVersion: request.host.protocolVersion,
      issuedAt: timestamp,
      heartbeatAt: timestamp,
      nonce: this.#createNonce(),
    }
    await mkdir(this.#stateDirectory, { recursive: true, mode: 0o700 })
    const finalDirectory = join(this.#stateDirectory, leaseDirectoryName(request.profileKey))
    const candidateDirectory = join(
      this.#stateDirectory,
      `.${leaseDirectoryName(request.profileKey)}.${lease.nonce}.tmp`,
    )
    await mkdir(candidateDirectory, { mode: 0o700 })
    await writeFile(join(candidateDirectory, 'lease.json'), `${JSON.stringify(lease)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    try {
      await rename(candidateDirectory, finalDirectory)
      return { kind: 'owned', lease }
    } catch (cause) {
      await removeCandidate(candidateDirectory)
      if (!isAlreadyOwnedError(cause)) throw cause
      const active = parseLease(await readFile(join(finalDirectory, 'lease.json'), 'utf8'))
      if (active.profileKey !== request.profileKey) throw new Error('profile lease key does not match')
      return { kind: 'attached', lease: active }
    }
  }

  async release(lease: ProfileOwnershipLease): Promise<void> {
    const directory = join(this.#stateDirectory, leaseDirectoryName(lease.profileKey))
    const active = parseLease(await readFile(join(directory, 'lease.json'), 'utf8'))
    if (
      active.ownerHostId !== lease.ownerHostId
      || active.generationId !== lease.generationId
      || active.nonce !== lease.nonce
    ) {
      throw new Error('lease ownership does not match')
    }
    await unlink(join(directory, 'lease.json'))
    await rmdir(directory)
  }
}
