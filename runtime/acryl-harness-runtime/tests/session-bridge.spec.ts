import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  AcrAgentControlError,
  AcrAgentControlService,
  type AgentCommand,
  type AgentProvider,
  type AttachAgentRequest,
} from 'acryl-control'
import { bootAcrylHarnessProfile } from '../src/index.ts'
import { createAcrylSessionBridge, type AssistantStreamFrame } from '../src/session-bridge.ts'

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
  // Assigning undefined would store the string "undefined" and the next boot would create a ./undefined profile directory.
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
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

      expect(runtime.ctx.agents.get(SessionId(sessionId))?.session.snapshotEvents()).toContainEqual(expect.objectContaining({
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
        // Session format v2: a durable Assistant settlement carries its compact stream.
        stream: [
          { type: 'chunk', time: 1, chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } } },
          { type: 'chunk', time: 2, chunk: { type: 'finish', reason: { kind: 'stop' } } },
        ],
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'Native response' }],
          source: { provider: 'test', model: 'test' },
        }),
      } as never, { surfaceOp: 'append' })
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

  it('streams incremental durable events to an event subscription', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      const seen: string[] = []
      const subscription = await bridge.subscribeEvents(sessionId, event => {
        seen.push(event.type)
      })

      const session = runtime.ctx.agents.get(SessionId(sessionId))?.session
      if (session === undefined) throw new Error('test agent was not registered')
      session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text', text: 'hello' } })
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(seen).toContain('assistant/chunk')

      await subscription.dispose()
      session.append('tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'inspect', arguments: '{}' })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(seen).not.toContain('tool/call')
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('exposes the full durable event log for store seeding and replay', async () => {
    const runtime = await bootRuntime('acryl-test')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      await bridge.submitPrompt({ sessionId, text: 'seed me' })

      const events = bridge.events(sessionId)
      expect(events.some(event => event.type === 'user/message')).toBe(true)
      expect(events).toEqual(runtime.ctx.agents.get(SessionId(sessionId))?.session.snapshotEvents())
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

/** Stub `acp`-id provider that records attach requests and dispatched commands. */
function stubAcpProvider(options: {
  readonly sendResult?: unknown
  readonly sendError?: Error
  /** Full send override; used to gate or order concurrent sends. */
  readonly sendHandler?: (payload: unknown) => Promise<unknown>
} = {}): {
  provider: AgentProvider
  attachRequests: AttachAgentRequest[]
  commands: AgentCommand[]
} {
  const attachRequests: AttachAgentRequest[] = []
  const commands: AgentCommand[] = []
  const provider: AgentProvider = {
    id: 'acp',
    fidelity: 'structured',
    capabilities: Object.freeze([
      'agent.start',
      'agent.stop',
      'agent.send',
      'agent.cancel',
      'agent.resume',
      'agent.snapshot',
      'output.structured',
      'tool.calls',
    ]),
    async attach(request) {
      attachRequests.push(request)
      return Object.freeze({
        workerId: request.workerId,
        runtimeId: null,
        providerId: request.providerId,
        providerSessionRef: request.providerSessionRef ?? null,
        harnessSessionId: request.harnessSessionId ?? null,
        workspace: request.workspace,
        capabilities: Object.freeze([...request.capabilities]),
        fidelity: request.fidelity,
        status: 'idle',
      })
    },
    async execute(_binding, command) {
      commands.push(command)
      if (command.kind === 'start' || command.kind === 'resume') {
        return { sessionId: 'acp-session-1', runtimeId: 'runtime-1', status: 'idle' }
      }
      if (command.kind === 'send') {
        if (options.sendHandler !== undefined) return options.sendHandler(command.payload)
        if (options.sendError !== undefined) throw options.sendError
        return options.sendResult ?? { stopReason: 'end_turn', updates: [] }
      }
      if (command.kind === 'cancel') return { cancelled: true }
      return { stopped: true }
    },
  }
  return { provider, attachRequests, commands }
}

/** A bare Cordis root with the agent-control service mounted (no DSH profile). */
async function bootedControl() {
  const ctx = new Context()
  const fiber = ctx.plugin(AcrAgentControlService)
  await fiber
  return { ctx, control: ctx.acrAgentControl, dispose: () => fiber.dispose() }
}

describe('createAcrylSessionBridge — acrAgentControl provider routing', () => {
  it('routes open, prompt, cancel and dispose through attach + dispatch', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const stub = stubAcpProvider()
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: 'worker-acp' },
    })
    try {
      const sessionId = await bridge.open()
      expect(sessionId).toBe('worker-acp')
      expect(stub.attachRequests).toHaveLength(1)
      expect(stub.attachRequests[0]).toMatchObject({
        workerId: 'worker-acp',
        providerId: 'acp',
        workspace: { identity: 'acryl-test', cwd: process.cwd() },
      })
      expect(stub.commands.map(command => command.kind)).toEqual(['start'])

      await bridge.submitPrompt({ sessionId, text: 'Hello agent' })
      await bridge.cancel(sessionId)
      expect(stub.commands.map(command => command.kind)).toEqual(['start', 'send', 'cancel'])
      expect(stub.commands[1]).toMatchObject({ kind: 'send', payload: 'Hello agent' })
    } finally {
      await bridge.dispose()
      await dispose()
    }
    expect(stub.commands.map(command => command.kind)).toEqual(['start', 'send', 'cancel', 'stop'])
  })

  it('propagates binding identity and projects send updates into stream frames and the snapshot', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const stub = stubAcpProvider({
      sendResult: {
        stopReason: 'end_turn',
        updates: [
          { sessionId: 'acp-session-1', update: { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: 'Hello' } } },
          { sessionId: 'acp-session-1', update: { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: ' world' } } },
          { sessionId: 'acp-session-1', update: { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'Read file', kind: 'other', status: 'pending' } },
          { sessionId: 'acp-session-1', update: { sessionUpdate: 'tool_call_update', toolCallId: 'call_1', status: 'completed' } },
        ],
      },
    })
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: 'worker-acp' },
    })
    try {
      const sessionId = await bridge.open()
      const frames: AssistantStreamFrame[] = []
      await bridge.subscribeAssistantStream(sessionId, frame => frames.push(frame))
      await bridge.submitPrompt({ sessionId, text: 'Hi' })

      expect(frames[0]).toMatchObject({ type: 'start', turn: 1 })
      const deltas = frames.flatMap(frame =>
        frame.type === 'chunk' && frame.chunk.type === 'text-delta' ? [frame.chunk.text] : [])
      expect(deltas).toEqual(['Hello', ' world'])
      expect(frames.some(frame => frame.type === 'chunk' && frame.chunk.type === 'tool-call-delta')).toBe(true)
      // No durable DSH settlement exists for a provider turn — the end frame
      // must report 'abandoned' rather than a fabricated committed seq.
      expect(frames.at(-1)).toMatchObject({ type: 'end', outcome: { kind: 'abandoned' } })

      await expect(bridge.snapshot(sessionId)).resolves.toMatchObject({
        sessionId: 'worker-acp',
        agentStatus: 'idle',
        transcript: [
          { author: 'user', text: 'Hi' },
          { author: 'assistant', text: 'Hello world' },
        ],
        tools: [{ callId: 'call_1', name: 'Read file', status: 'succeeded' }],
        provider: {
          providerId: 'acp',
          workerId: 'worker-acp',
          runtimeId: 'runtime-1',
          providerSessionRef: 'acp-session-1',
          status: 'idle',
        },
      })
      expect(bridge.events(sessionId)).toEqual([])
    } finally {
      await bridge.dispose()
      await dispose()
    }
  })

  it('resumes through dispatch resume carrying the provider session ref', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const stub = stubAcpProvider()
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: 'worker-acp' },
    })
    try {
      await bridge.open('acp-session-9')
      expect(stub.attachRequests[0]).toMatchObject({ providerSessionRef: 'acp-session-9' })
      expect(stub.attachRequests[0]?.capabilities).toContain('agent.resume')
      expect(stub.commands.map(command => command.kind)).toEqual(['resume'])
    } finally {
      await bridge.dispose()
      await dispose()
    }
  })

  it('serializes concurrent provider sends on one session', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const completed: string[] = []
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const stub = stubAcpProvider({
      sendHandler: async (payload) => {
        // The first send blocks until released; a serialized bridge must not
        // dispatch the second while the first is in flight.
        if (payload === 'first') await gate
        completed.push(payload as string)
        return { stopReason: 'end_turn', updates: [] }
      },
    })
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: 'worker-acp' },
    })
    try {
      const sessionId = await bridge.open()
      const first = bridge.submitPrompt({ sessionId, text: 'first' })
      const second = bridge.submitPrompt({ sessionId, text: 'second' })
      await new Promise((resolve) => setTimeout(resolve, 25))
      // The second send is queued behind the still-running first turn.
      expect(completed).toEqual([])
      releaseFirst()
      await Promise.all([first, second])
      expect(completed).toEqual(['first', 'second'])
      expect(stub.commands.filter(command => command.kind === 'send').map(command => command.payload))
        .toEqual(['first', 'second'])
    } finally {
      await bridge.dispose()
      await dispose()
    }
  })

  it('rejects an empty provider workerId at construction', () => {
    const ctx = new Context()
    expect(() => createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: '   ' },
    })).toThrow('workerId')
  })

  it('surfaces dispatch failures to the caller in the service error shape', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const stub = stubAcpProvider({
      sendError: new AcrAgentControlError('transport-unavailable', 'provider transport blew up'),
    })
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp', workerId: 'worker-acp' },
    })
    try {
      const sessionId = await bridge.open()
      await expect(bridge.submitPrompt({ sessionId, text: 'Hi' }))
        .rejects.toMatchObject({ code: 'transport-unavailable', message: 'provider transport blew up' })
    } finally {
      await bridge.dispose()
      await dispose()
    }
  })

  it('refuses live model selection on a provider session', async () => {
    const { ctx, control, dispose } = await bootedControl()
    const stub = stubAcpProvider()
    control.registerProvider(ctx, stub.provider)
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp' },
    })
    try {
      const sessionId = await bridge.open()
      await expect(bridge.selectModel({ sessionId, provider: 'deepseek', model: 'x' }))
        .rejects.toThrow('does not support live model selection')
    } finally {
      await bridge.dispose()
      await dispose()
    }
  })

  it('fails loudly when a provider is selected but acrAgentControl is not mounted', async () => {
    const ctx = new Context()
    const bridge = createAcrylSessionBridge(ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'acp' },
    })
    await expect(bridge.open()).rejects.toThrow('acrAgentControl')
    await bridge.dispose()
  })

  it('keeps the DSH-native path when no provider is selected', async () => {
    const runtime = await bootRuntime('acryl-test')
    const createSpy = vi.spyOn(runtime.ctx.agents, 'create')
    const attachSpy = vi.spyOn(runtime.ctx.acrAgentControl, 'attach')
    const dispatchSpy = vi.spyOn(runtime.ctx.acrAgentControl, 'dispatch')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
    })
    try {
      const sessionId = await bridge.open()
      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(attachSpy).not.toHaveBeenCalled()
      await bridge.submitPrompt({ sessionId, text: 'native path' })
      expect(dispatchSpy).not.toHaveBeenCalled()
      expect(await bridge.snapshot(sessionId)).not.toMatchObject({ provider: expect.anything() })
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })

  it('keeps the DSH-native path when the selection names dsh-native', async () => {
    const runtime = await bootRuntime('acryl-test')
    const createSpy = vi.spyOn(runtime.ctx.agents, 'create')
    const attachSpy = vi.spyOn(runtime.ctx.acrAgentControl, 'attach')
    const bridge = createAcrylSessionBridge(runtime.ctx, {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      cwd: process.cwd(),
      agentProvider: { providerId: 'dsh-native' },
    })
    try {
      const sessionId = await bridge.open()
      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(attachSpy).not.toHaveBeenCalled()
      expect(runtime.ctx.agents.get(SessionId(sessionId))).toBeDefined()
    } finally {
      await bridge.dispose()
      await runtime.dispose()
    }
  })
})
