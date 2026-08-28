import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
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
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })

    const sessionId = await bridge.open()
    const snapshot = await bridge.snapshot(sessionId)

    expect(snapshot).toMatchObject({
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      sessionId,
      agentStatus: 'idle',
      transcript: [],
      tools: [],
    })

    await bridge.dispose()
    await runtime.dispose()
  })

  it('forwards cancellation into the native active turn', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      const stop = runtime.ctx.on('session/event', (session, event) => {
        if (session.id === sessionId && event.type === 'user/message') bridge.cancel(sessionId)
      })
      await bridge.submitPrompt({ sessionId, text: 'Cancel this turn' })
      stop()

      expect(runtime.ctx.agents.get(SessionId(sessionId))?.session.events).toContainEqual(expect.objectContaining({
        type: 'turn/end',
        data: expect.objectContaining({ reason: expect.objectContaining({ kind: 'aborted' }) }),
      }))
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('notifies a subscription then stops after disposal', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      const updates: string[][] = []
      const subscription = await bridge.subscribe(sessionId, snapshot => {
        updates.push(snapshot.transcript.map(item => item.text))
      })
      await bridge.submitPrompt({ sessionId, text: 'Observed prompt' })
      expect(updates.at(-1)).toEqual(['Observed prompt'])

      await subscription.dispose()
      const session = runtime.ctx.agents.get(SessionId(sessionId))?.session
      if (session === undefined) throw new Error('test agent was not registered')
      session.append('todo/write', { todos: [] })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(updates.at(-1)).toEqual(['Observed prompt'])
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('resumes a persisted session and replays its durable transcript', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-one',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    const sessionId = await bridge.open()
    await bridge.submitPrompt({ sessionId, text: 'Keep this prompt' })
    await bridge.dispose()
    await runtime.dispose()

    const resumedRuntime = await bootAcrylHarnessProfile({ profile: 'acryl-test' })
    const resumedBridge = createAcrylSessionBridge(resumedRuntime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-two',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      await resumedBridge.open(sessionId)
      await expect(resumedBridge.snapshot(sessionId)).resolves.toMatchObject({
        transcript: [{ author: 'user', text: 'Keep this prompt' }],
      })
    } finally {
      await resumedBridge.dispose()
      await resumedRuntime.dispose()
    }
  })

  it('replays durable assistant and tool records into the projection', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      const session = runtime.ctx.agents.get(SessionId(sessionId))?.session
      if (session === undefined) throw new Error('test agent was not registered')
      session.append('turn/start', { turn: 1 })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('assistant/message', {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'Native response' }],
          source: { provider: 'test', model: 'test' },
        }),
      }, { surfaceOp: 'append' })
      session.append('tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'inspect', arguments: '{}' })
      session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: 'call-1',
          content: [{ type: 'text', text: 'done' }],
          isError: false,
        }),
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 1, step: 1 })
      session.append('turn/end', { turn: 1, reason: { kind: 'stop' } })

      await expect(bridge.snapshot(sessionId)).resolves.toMatchObject({
        transcript: [{ author: 'assistant', text: 'Native response' }],
        tools: [{ callId: 'call-1', name: 'inspect', status: 'succeeded' }],
      })
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('does not accumulate native agents for repeated opens', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      await bridge.open()
      await expect(bridge.open()).rejects.toThrow('already has an active session')
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('persists a submitted prompt in the native durable session', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
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
