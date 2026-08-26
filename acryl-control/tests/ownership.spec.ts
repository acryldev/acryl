import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ProfileLeaseStore,
  type HostInstance,
  type ProfileLeaseRequest,
} from '../src/ownership/lease-store.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-lease-'))
  temporaryDirectories.push(directory)
  return directory
}

function request(index: number): ProfileLeaseRequest {
  const host: HostInstance = {
    hostId: `host-${String(index)}`,
    kind: 'tui',
    generationId: `generation-${String(index)}`,
    pid: process.pid,
    startedAt: '2026-08-26T00:00:00.000Z',
    protocolVersion: 1,
    status: 'ready',
  }
  return {
    profileKey: 'desktop',
    host,
    endpoint: {
      kind: 'unix',
      address: `/tmp/acryl-${String(index)}.sock`,
      protocolVersion: 1,
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('ProfileLeaseStore', () => {
  it('allows exactly one owner during a concurrent acquisition race', async () => {
    const stateDirectory = await temporaryDirectory()
    const results = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
      return new ProfileLeaseStore({ stateDirectory }).acquire(request(index))
    }))

    const owned = results.filter(result => result.kind === 'owned')
    const attached = results.filter(result => result.kind === 'attached')

    expect(owned).toHaveLength(1)
    expect(attached).toHaveLength(99)
    expect(attached.every(result => result.lease.ownerHostId === owned[0]?.lease.ownerHostId)).toBe(true)
  })

  it('releases only the matching ownership generation', async () => {
    const stateDirectory = await temporaryDirectory()
    const store = new ProfileLeaseStore({ stateDirectory })
    const owner = await store.acquire(request(1))
    expect(owner.kind).toBe('owned')
    if (owner.kind !== 'owned') throw new Error('expected owner')

    await expect(store.release({
      ...owner.lease,
      nonce: 'not-the-owner',
    })).rejects.toThrow('lease ownership does not match')

    await store.release(owner.lease)
    const replacement = await store.acquire(request(2))
    expect(replacement.kind).toBe('owned')
  })
})
