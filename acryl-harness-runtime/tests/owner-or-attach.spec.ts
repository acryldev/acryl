import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { openAcrylSessionOwnerOrAttach } from '../src/index.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

async function prepareProfile(profile: string): Promise<void> {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-owner-or-attach-'))
  temporaryHomes.push(process.env.DSH_HOME)
  const profileDirectory = resolveProfileDir(profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('openAcrylSessionOwnerOrAttach', () => {
  it('reuses the existing owner without booting a second root', async () => {
    await prepareProfile('acryl-test')
    const owner = await openAcrylSessionOwnerOrAttach({ profile: 'acryl-test', cwd: process.cwd() })
    const attached = await openAcrylSessionOwnerOrAttach({ profile: 'acryl-test', cwd: process.cwd() })

    expect(owner.attachment).toBe('owner')
    expect(attached.attachment).toBe('attached')
    expect(attached.sessionId).toBe(owner.sessionId)
    await expect(attached.client.snapshot(attached.sessionId)).resolves.toMatchObject({
      attachment: 'attached',
      sessionId: owner.sessionId,
    })

    await attached.dispose()
    await owner.dispose()
  })

  it('rolls a failed owner startup back so the next request can own the profile', async () => {
    await prepareProfile('acryl-test')

    await expect(openAcrylSessionOwnerOrAttach({ profile: 'acryl-test', cwd: 'relative' })).rejects.toThrow(
      'absolute',
    )
    const owner = await openAcrylSessionOwnerOrAttach({ profile: 'acryl-test', cwd: process.cwd() })

    expect(owner.attachment).toBe('owner')
    await owner.dispose()
  })
})
