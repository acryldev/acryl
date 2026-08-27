import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { bootAcrylHarnessProfile } from '../src/index.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('bootAcrylHarnessProfile', () => {
  it('rejects an HMR-enabled profile outside an exposed-internals Node process', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-harness-home-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home

    await bootAcrylHarnessProfile({ profile: 'acryl-test' }).then(
      () => { throw new Error('expected HMR-enabled profile boot to reject') },
      error => expect(error).toHaveProperty('message', expect.stringContaining(
        'must be launched with Node --expose-internals',
      )),
    )
  })

  it('boots the pinned profile in one root with durable session and agent services', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-harness-home-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const profileDirectory = resolveProfileDir('acryl-test')
    initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
    await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')

    const runtime = await bootAcrylHarnessProfile({ profile: 'acryl-test' })

    expect(runtime.ctx.get('sessions')).toBeDefined()
    expect(runtime.ctx.get('agents')).toBeDefined()
    await runtime.dispose()
  })
})
