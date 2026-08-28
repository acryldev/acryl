import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { startDirectHost } from '../src/host/direct.ts'

const temporaryDirectories: string[] = []
const initialDshHome = process.env.DSH_HOME

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-direct-'))
  temporaryDirectories.push(directory)
  return directory
}

async function configureProductionProfileForTest(): Promise<void> {
  const profileDirectory = resolveProfileDir('desktop')
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
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
    await configureProductionProfileForTest()
    const host = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'host-1',
      generationId: 'generation-1',
    })

    if (host.ctx === undefined) throw new Error('expected an owner host')
    expect(host.profile).toBe('desktop')
    expect(host.generationId).toBe('generation-1')
    expect(host.runtimeState).toBe('ready')
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

  it('attaches without booting a competing root when another live owner holds the profile', async () => {
    const stateDirectory = await temporaryDirectory()
    process.env.DSH_HOME = await temporaryDirectory()
    await configureProductionProfileForTest()
    const owner = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'owner',
      generationId: 'generation-owner',
    })

    const attached = await startDirectHost({
      profile: 'desktop',
      stateDirectory,
      hostId: 'contender',
      generationId: 'generation-contender',
    })

    expect(attached.attachment).toBe('attached')
    expect(attached.ctx).toBeUndefined()
    expect(attached.generationId).toBe('generation-owner')
    await attached.dispose()
    await owner.dispose()
  })

  it('releases the lease and endpoint when disposed', async () => {
    const stateDirectory = await temporaryDirectory()
    process.env.DSH_HOME = await temporaryDirectory()
    await configureProductionProfileForTest()
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
    if (second.ctx === undefined) throw new Error('expected a replacement owner host')
    expect(second.ctx.acrProfileOwnership.current.kind).toBe('owned')
    await second.dispose()
  })
})
