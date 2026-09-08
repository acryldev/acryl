import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { startDirectHost } from '../src/host/direct.ts'

const temporaryDirectories: string[] = []
const initialDshHome = process.env.DSH_HOME

async function setup(): Promise<void> {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-direct-'))
  temporaryDirectories.push(process.env.DSH_HOME)
  const profileDirectory = resolveProfileDir('desktop')
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('startDirectHost', () => {
  it('starts a normal local runtime', async () => {
    await setup()
    const host = await startDirectHost({ profile: 'desktop' })
    expect(host.runtimeState).toBe('ready')
    expect(host.ctx.get('sessions')).toBeDefined()
    expect(host.ctx.get('agents')).toBeDefined()
    await host.dispose()
  })
})
