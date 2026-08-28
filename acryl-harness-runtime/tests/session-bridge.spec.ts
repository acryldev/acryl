import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { bootAcrylHarnessProfile } from '../src/index.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

async function bootRuntime(profile: string) {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-session-bridge-'))
  temporaryHomes.push(process.env.DSH_HOME)
  const profileDirectory = resolveProfileDir(profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
  return bootAcrylHarnessProfile({ profile })
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('createAcrylSessionBridge', () => {
  it('creates one native durable session and projects its initial state', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })

    const sessionId = await bridge.open()
    const snapshot = await bridge.snapshot(sessionId)

    expect(snapshot).toMatchObject({
      profile: 'acryl-test',
      attachment: 'owner',
      sessionId,
      agentStatus: 'idle',
      transcript: [],
      tools: [],
    })

    await bridge.dispose()
    await runtime.dispose()
  })

  it('persists a submitted prompt in the native durable session', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()

      await bridge.submitPrompt({ sessionId, text: 'Persist this prompt' })
      await new Promise(resolve => setTimeout(resolve, 25))

      await expect(bridge.snapshot(sessionId)).resolves.toMatchObject({
        transcript: [{ author: 'user', text: 'Persist this prompt' }],
      })
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })
})
