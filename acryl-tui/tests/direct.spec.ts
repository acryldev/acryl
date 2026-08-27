import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DirectHostAlreadyOwnedError,
  startDirectHost,
} from '../src/host/direct.ts'

const temporaryDirectories: string[] = []
const initialDshHome = process.env.DSH_HOME

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-direct-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('startDirectHost', () => {
  it('acquires the profile and composes ownership, architecture, agent, and protocol services', async () => {
    const stateDirectory = await temporaryDirectory()
    process.env.DSH_HOME = await temporaryDirectory()
    const host = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'host-1',
      generationId: 'generation-1',
    })

    expect(host.profile).toBe('desktop')
    expect(host.generationId).toBe('generation-1')
    expect(host.ctx.acrProfileOwnership.current.kind).toBe('owned')
    expect(host.ctx.acrRuntimeArchitecture.snapshot('host').plane).toBe('host')
    expect(await host.ctx.acrAgentControl.snapshot()).toEqual([])
    expect(host.ctx.get('sessions')).toBeDefined()
    expect(host.ctx.get('agents')).toBeDefined()
    expect(host.ctx.acrControlProtocol).toEqual(expect.objectContaining({
      generationId: 'generation-1',
      endpoint: host.endpoint,
      capabilities: ['host.status', 'architecture.inspect'],
    }))

    await host.dispose()
  })

  it('fails closed when another live owner holds the profile', async () => {
    const stateDirectory = await temporaryDirectory()
    process.env.DSH_HOME = await temporaryDirectory()
    const owner = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'owner',
      generationId: 'generation-owner',
    })

    await expect(startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'contender',
      generationId: 'generation-contender',
    })).rejects.toBeInstanceOf(DirectHostAlreadyOwnedError)

    await owner.dispose()
  })

  it('releases the lease and endpoint when disposed', async () => {
    const stateDirectory = await temporaryDirectory()
    process.env.DSH_HOME = await temporaryDirectory()
    const first = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'host-1',
      generationId: 'generation-1',
    })
    await first.dispose()

    const second = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'host-2',
      generationId: 'generation-2',
    })
    expect(second.ctx.acrProfileOwnership.current.kind).toBe('owned')
    await second.dispose()
  })
})
