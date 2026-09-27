import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent, type AgentHandle, type AssistantStreamFrame, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { LlmAttemptId, ToolCallId, createUserMessage, type FinishReason, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session-persistence'

export type { AssistantStreamFrame }
import type {
  AcrAgentControl,
  AcrWorkerId,
  AcrylSessionAttachment,
  AcrylSessionProviderBinding,
  AcrylSessionSnapshot,
  AcrylSessionSubscription,
  AcrylToolProjection,
  AcrylToolStatus,
  AcrylTranscriptItem,
  AgentCapability,
  AgentFidelity,
  AgentSnapshot,
  AgentStatus,
  AttachAgentRequest,
} from 'acryl-control'

/**
 * Optional agent-control binding for a bridge session. When `providerId` names
 * a non-`'dsh-native'` provider and `acrAgentControl` is mounted, the bridge
 * routes `open`/`submitPrompt`/`cancel`/`dispose` through `attach` +
 * `dispatch` instead of the DSH-native `ctx.agents` path.
 */
export interface AcrylSessionAgentProvider {
  /** Registered `acrAgentControl` provider id (e.g. `'acp'`). `'dsh-native'` keeps the native path. */
  readonly providerId: string
  /** Canonical ACRYL worker identity for the binding; the generated bridge session id when omitted. */
  readonly workerId?: AcrWorkerId
  /** Fidelity declared at attach; `'structured'` when omitted. */
  readonly fidelity?: AgentFidelity
}

export interface AcrylSessionBridgeOptions {
  readonly profile: string
  readonly generationId: string
  readonly attachment: AcrylSessionAttachment
  readonly cwd: string
  /** Provider binding for this bridge's session; omitted or `'dsh-native'` keeps the native path. */
  readonly agentProvider?: AcrylSessionAgentProvider
}

export interface AcrylSessionEventSubscription {
  dispose(): Promise<void>
}

export interface AcrylSessionBridge {
  open(resumeSessionId?: string): Promise<string>
  snapshot(sessionId: string): Promise<AcrylSessionSnapshot>
  /** The full durable event log for one session — the surface's replay/seed source. */
  events(sessionId: string): readonly SessionEvent[]
  subscribe(
    sessionId: string,
    listener: (snapshot: AcrylSessionSnapshot) => void,
    onError?: (error: Error) => void,
  ): Promise<AcrylSessionSubscription>
  /** Live durable-log events for one active session (streaming presentation seam). */
  subscribeEvents(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): Promise<AcrylSessionEventSubscription>
  /**
   * Process-local live assistant-stream frames (start/chunk/end) for one
   * active session. Session format v2 no longer persists per-token
   * `assistant/chunk` events in the durable log — `agent/assistant-stream`
   * is the intentionally process-local replacement for in-progress-typing
   * presentation; the durable `assistant/message`/`assistant/attempt`
   * settlement (delivered via `subscribeEvents`) carries the same stream
   * for replay once the attempt settles.
   */
  subscribeAssistantStream(
    sessionId: string,
    listener: (frame: AssistantStreamFrame) => void,
  ): Promise<AcrylSessionEventSubscription>
  submitPrompt(input: { readonly sessionId: string; readonly text: string }): Promise<void>
  /**
   * Switch an already-open session's live model. `agentOptions.provider`/`model`
   * are a one-time construction input to `ctx.agents.create` — not a live
   * setting — so this is the only thing that changes what a running session
   * sends its next request to (`ModelSelectionRef` installed on the agent's
   * own scoped context via `installModelSelection`, per-step prompt assembly
   * reads it fresh).
   */
  selectModel(input: { readonly sessionId: string; readonly provider: string; readonly model: string }): Promise<void>
  cancel(sessionId: string): Promise<void>
  dispose(): Promise<void>
}

function contentText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } => {
      return block.type === 'text' && typeof block.text === 'string'
    })
    .map(block => block.text)
    .join('')
}

function transcript(events: readonly SessionEvent[]): readonly AcrylTranscriptItem[] {
  const items: AcrylTranscriptItem[] = []
  for (const event of events) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const text = contentText(event.data.content)
      if (text !== '') items.push(Object.freeze({ id: `event-${event.seq}`, author: 'user', text }))
    }
    if (event.type === 'assistant/message') {
      const text = contentText(event.data.message.content)
      if (text !== '') items.push(Object.freeze({ id: `event-${event.seq}`, author: 'assistant', text }))
    }
  }
  return Object.freeze(items)
}

function tools(events: readonly SessionEvent[]): readonly AcrylToolProjection[] {
  const current = new Map<string, AcrylToolProjection>()
  for (const event of events) {
    if (event.type === 'tool/call') {
      current.set(event.data.callId, Object.freeze({
        callId: event.data.callId,
        name: event.data.name,
        status: 'running',
      }))
    }
    if (event.type === 'tool/result') {
      const callId = event.data.message.source.callId
      const existing = current.get(callId)
      if (existing !== undefined) {
        current.set(callId, Object.freeze({ ...existing, status: 'succeeded' }))
      }
    }
  }
  return Object.freeze([...current.values()])
}

function status(agent: Agent): AcrylSessionSnapshot['agentStatus'] {
  return agent.status === 'running' ? 'running' : 'idle'
}

/** Provider-side session state for one `acrAgentControl`-bound worker. */
interface ProviderSessionState {
  readonly workerId: AcrWorkerId
  /** Latest binding, refreshed from `acrAgentControl.snapshot` after each dispatch. */
  binding: AgentSnapshot
  /** Turn counter; provider sends synthesize one assistant-stream attempt each. */
  turn: number
  readonly transcript: AcrylTranscriptItem[]
  /** ACP `messageId` → transcript index, so streamed chunks merge into one item. */
  readonly transcriptIndexByMessage: Map<string, number>
  readonly tools: Map<string, AcrylToolProjection>
}

/** Commands the bridge dispatches on a provider session; `agent.resume` joins when `open` resumes. */
const BRIDGE_PROVIDER_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  'agent.start',
  'agent.send',
  'agent.cancel',
  'agent.stop',
])

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Provider `AgentStatus` → the narrower bridge status union. */
function providerAgentStatus(status: AgentStatus): AcrylSessionSnapshot['agentStatus'] {
  switch (status) {
    case 'running':
    case 'stopping':
      return 'running'
    case 'waiting':
      return 'waiting'
    case 'failed':
      return 'failed'
    // 'stopped' surfaces as 'idle': a stopped worker holds no live runtime,
    // the closest honest member of the narrower union.
    default:
      return 'idle'
  }
}

function providerBinding(binding: AgentSnapshot): AcrylSessionProviderBinding {
  return Object.freeze({
    providerId: binding.providerId,
    workerId: binding.workerId,
    runtimeId: binding.runtimeId,
    providerSessionRef: binding.providerSessionRef,
    status: binding.status,
  })
}

/** ACP tool status → the bridge's tool-projection union. */
function acpToolStatus(status: unknown): AcrylToolStatus {
  switch (status) {
    case 'in_progress':
      return 'running'
    case 'completed':
      return 'succeeded'
    case 'failed':
    case 'cancelled':
      return 'failed'
    default:
      return 'pending'
  }
}

/** ACP `stopReason` → the harness finish-reason union. */
function acpFinishReason(stopReason: unknown): FinishReason {
  switch (stopReason) {
    case 'max_tokens':
      return { kind: 'max-tokens' }
    case 'cancelled':
      return { kind: 'aborted', failure: { message: 'The agent cancelled the turn.', code: 'cancelled' } }
    case 'refusal':
      return { kind: 'error', failure: { message: 'The agent refused the prompt.', code: 'refusal' } }
    default:
      return { kind: 'stop' }
  }
}

function appendTranscriptChunk(session: ProviderSessionState, messageId: string, text: string): void {
  const index = session.transcriptIndexByMessage.get(messageId)
  if (index === undefined) {
    session.transcriptIndexByMessage.set(messageId, session.transcript.length)
    session.transcript.push(Object.freeze({
      id: `${session.workerId}-message-${messageId}`,
      author: 'assistant',
      text,
    }))
    return
  }
  const existing = session.transcript[index]
  if (existing === undefined) return
  session.transcript[index] = Object.freeze({ ...existing, text: existing.text + text })
}

/**
 * Fold one `send` receipt's `{stopReason, updates[]}` into assistant-stream
 * frames and the session's transcript/tool projection. ACP `session/update`
 * notifications are semantic events (message chunks, tool calls), so they
 * project as stream chunks and projection entries — never into a DSH durable
 * session log, which provider-bound sessions do not have.
 */
function projectProviderTurn(session: ProviderSessionState, result: unknown): readonly AssistantStreamFrame[] {
  const turn = ++session.turn
  const attemptId = LlmAttemptId(`acp-${session.workerId}-${turn}`)
  const revision = 1
  const frames: AssistantStreamFrame[] = [
    Object.freeze({ type: 'start', attemptId, revision, turn, step: 1 }),
  ]
  const resultRecord = recordOf(result)
  const updates = Array.isArray(resultRecord?.updates) ? resultRecord.updates as unknown[] : []
  const blockByMessage = new Map<string, number>()
  let nextBlock = 0
  let index = 0
  const emit = (chunk: StreamChunk): void => {
    frames.push(Object.freeze({ type: 'chunk', attemptId, revision, index: index++, time: Date.now(), chunk }))
  }
  for (const raw of updates) {
    const update = recordOf(recordOf(raw)?.update)
    const kind = update?.sessionUpdate
    if (update === undefined || typeof kind !== 'string') continue
    if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
      const content = recordOf(update.content)
      if (content?.type !== 'text' || typeof content.text !== 'string' || content.text === '') continue
      const reasoning = kind === 'agent_thought_chunk'
      const messageId = typeof update.messageId === 'string' ? update.messageId : `update-${nextBlock}`
      // Message and thought streams are distinct blocks even if a provider
      // reuses one messageId across both kinds.
      const blockKey = `${reasoning ? 'thought' : 'message'}:${messageId}`
      let block = blockByMessage.get(blockKey)
      if (block === undefined) {
        block = nextBlock++
        blockByMessage.set(blockKey, block)
        emit({ type: 'block-start', index: block, blockType: reasoning ? 'reasoning' : 'text' })
      }
      emit({ type: reasoning ? 'reasoning-delta' : 'text-delta', index: block, text: content.text })
      if (!reasoning) appendTranscriptChunk(session, messageId, content.text)
      continue
    }
    if (kind === 'tool_call') {
      const toolCallId = update.toolCallId
      if (typeof toolCallId !== 'string' || toolCallId === '') continue
      const name = typeof update.title === 'string' && update.title !== '' ? update.title : 'tool'
      const block = nextBlock++
      emit({ type: 'block-start', index: block, blockType: 'tool-call' })
      emit({ type: 'tool-call-delta', index: block, id: ToolCallId(toolCallId), name, argumentsDelta: '' })
      session.tools.set(toolCallId, Object.freeze({ callId: toolCallId, name, status: acpToolStatus(update.status) }))
      continue
    }
    if (kind === 'tool_call_update') {
      const toolCallId = update.toolCallId
      if (typeof toolCallId !== 'string') continue
      const existing = session.tools.get(toolCallId)
      if (existing === undefined) continue
      session.tools.set(toolCallId, Object.freeze({ ...existing, status: acpToolStatus(update.status) }))
      continue
    }
    // Other update kinds (plan, user_message_chunk, mode changes, …) have no
    // assistant-stream chunk representation and stay unprojected.
  }
  emit({ type: 'finish', reason: acpFinishReason(resultRecord?.stopReason) })
  // A provider turn never writes a durable DSH settlement, so 'committed'
  // (which requires a real SessionSeq) is impossible — 'abandoned' is the only
  // honest outcome for the end frame.
  frames.push(Object.freeze({ type: 'end', attemptId, revision, index, outcome: { kind: 'abandoned' } as const }))
  return Object.freeze(frames)
}

/**
 * Runtime-owned adapter over one agent session. Sessions bound to a
 * non-`'dsh-native'` provider route through `acrAgentControl` (`attach` +
 * `dispatch`); every other session keeps the native `ctx.agents`/`AgentHandle`
 * path and derives every presentation value from its durable log.
 */
export function createAcrylSessionBridge(
  ctx: Context,
  options: AcrylSessionBridgeOptions,
): AcrylSessionBridge {
  const handles = new Map<string, AgentHandle>()
  const providerSessions = new Map<string, ProviderSessionState>()
  const modelSelections = new Map<string, ModelSelectionRef>()
  const modelSelectionDisposers = new Map<string, () => void>()
  const subscribers = new Map<string, Set<(snapshot: AcrylSessionSnapshot) => void>>()
  const eventListeners = new Map<string, Set<(event: SessionEvent) => void>>()
  const assistantStreamListeners = new Map<string, Set<(frame: AssistantStreamFrame) => void>>()
  let disposed = false

  // The provider path engages only when the caller explicitly binds the
  // session to a non-'dsh-native' provider. `acrAgentControl` is an optional
  // `ctx.get` dependency — resolved per operation so a late-mounted service
  // (PENDING at bridge creation) still works, and a selected provider whose
  // control surface never mounts fails loudly at `open` instead of silently
  // opening a native session the caller did not ask for.
  const providerSelection = options.agentProvider !== undefined && options.agentProvider.providerId !== 'dsh-native'
    ? options.agentProvider
    : undefined

  const agentControl = (): AcrAgentControl => {
    const control = ctx.get('acrAgentControl')
    if (control === undefined) {
      throw new Error(
        `ACRYL agent provider '${providerSelection?.providerId ?? ''}' requires the acrAgentControl service, which is not mounted`,
      )
    }
    return control
  }

  const refreshProviderBinding = async (control: AcrAgentControl, session: ProviderSessionState): Promise<void> => {
    const binding = (await control.snapshot({ workerId: session.workerId }))[0]
    if (binding !== undefined) session.binding = binding
  }

  const emitAssistantFrames = (sessionId: string, frames: readonly AssistantStreamFrame[]): void => {
    const listeners = assistantStreamListeners.get(sessionId)
    if (listeners === undefined) return
    for (const listener of listeners) {
      for (const frame of frames) {
        try {
          listener(frame)
        } catch {
          // A presentation listener cannot disrupt provider session delivery.
        }
      }
    }
  }

  const notify = (sessionId: string): void => {
    const listeners = subscribers.get(sessionId)
    if (listeners === undefined) return
    void snapshot(sessionId).then((next) => {
      for (const listener of listeners) {
        try {
          listener(next)
        } catch {
          // A presentation listener cannot disrupt durable session delivery.
        }
      }
    })
  }
  const offSessionEvent = ctx.on('session/event', (session, event) => {
    if (!handles.has(session.id)) return
    notify(session.id)
    const listeners = eventListeners.get(session.id)
    if (listeners === undefined) return
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // A presentation listener cannot disrupt durable session delivery.
      }
    }
  })
  // `agent/assistant-stream` is process-local and dispatched per-agent by
  // `@deepseek-ai/dsh-scope`; `{ global: true }` receives every agent's
  // frames and this bridge filters to the sessions it owns, matching the
  // pattern `dsh-api-session-controller`'s own history/follow code uses for
  // the same event.
  const offAssistantStream = ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (!handles.has(agent.session.id)) return
    const listeners = assistantStreamListeners.get(agent.session.id)
    if (listeners === undefined) return
    for (const listener of listeners) {
      try {
        listener(frame)
      } catch {
        // A presentation listener cannot disrupt durable session delivery.
      }
    }
  }, { global: true })

  const snapshot = async (sessionId: string): Promise<AcrylSessionSnapshot> => {
    const providerSession = providerSessions.get(sessionId)
    if (providerSession !== undefined) {
      if (disposed) throw new Error('ACRYL session bridge is disposed')
      return Object.freeze({
        profile: options.profile,
        generationId: options.generationId,
        attachment: options.attachment,
        sessionId: providerSession.workerId,
        agentStatus: providerAgentStatus(providerSession.binding.status),
        transcript: Object.freeze([...providerSession.transcript]),
        tools: Object.freeze([...providerSession.tools.values()]),
        provider: providerBinding(providerSession.binding),
      })
    }
    const agent = agentFor(sessionId)
    return Object.freeze({
      profile: options.profile,
      generationId: options.generationId,
      attachment: options.attachment,
      sessionId: agent.id,
      agentStatus: status(agent),
      transcript: transcript(agent.session.snapshotEvents()),
      tools: tools(agent.session.snapshotEvents()),
    })
  }

  const agentFor = (sessionId: string): Agent => {
    if (disposed) throw new Error('ACRYL session bridge is disposed')
    const handle = handles.get(sessionId)
    if (handle === undefined) throw new Error(`ACRYL session ${sessionId} is not active`)
    return handle.agent
  }

  /** Active-session check that accepts both native and provider-bound sessions. */
  const requireActiveSession = (sessionId: string): void => {
    if (disposed) throw new Error('ACRYL session bridge is disposed')
    if (!handles.has(sessionId) && !providerSessions.has(sessionId)) {
      throw new Error(`ACRYL session ${sessionId} is not active`)
    }
  }

  return Object.freeze({
    async open(resumeSessionId?: string): Promise<string> {
      if (disposed) throw new Error('ACRYL session bridge is disposed')
      if (handles.size !== 0 || providerSessions.size !== 0) throw new Error('ACRYL session bridge already has an active session')
      if (providerSelection !== undefined) {
        const control = agentControl()
        // The worker identity is the bridge session identity: the session id
        // callers receive and dispatch with.
        const workerId = providerSelection.workerId ?? `acryl-session-${crypto.randomUUID()}`
        const capabilities: AgentCapability[] = [...BRIDGE_PROVIDER_CAPABILITIES]
        if (resumeSessionId !== undefined) capabilities.push('agent.resume')
        const request: AttachAgentRequest = {
          workerId,
          providerId: providerSelection.providerId,
          workspace: { identity: options.profile, cwd: options.cwd },
          capabilities,
          fidelity: providerSelection.fidelity ?? 'structured',
          // For a resume, the resume id IS the vendor session reference.
          ...(resumeSessionId === undefined ? {} : { providerSessionRef: resumeSessionId }),
        }
        const binding = await control.attach(request)
        const session: ProviderSessionState = {
          workerId,
          binding,
          turn: 0,
          transcript: [],
          transcriptIndexByMessage: new Map(),
          tools: new Map(),
        }
        providerSessions.set(workerId, session)
        try {
          await control.dispatch(workerId, { kind: resumeSessionId === undefined ? 'start' : 'resume', payload: null })
        } catch (error) {
          providerSessions.delete(workerId)
          // The attach already stored a binding; a failed start must not leave
          // the worker looking live. Best-effort stop releases it.
          try {
            await control.dispatch(workerId, { kind: 'stop', payload: null })
          } catch {
            // Releasing the binding is best-effort; the start failure is what propagates.
          }
          throw error
        }
        await refreshProviderBinding(control, session)
        return workerId
      }
      const defaultModel = ctx.get('agentDefaultModel')
      if (defaultModel === undefined) throw new Error('ACRYL profile has no default agent model')
      const selection = defaultModel.currentSelection()
      const handle = resumeSessionId === undefined
        ? await ctx.agents.create({
            sessionId: SessionId(`acryl-session-${crypto.randomUUID()}`),
            meta: { cwd: options.cwd },
            agentOptions: { provider: selection.provider, model: selection.model },
          })
        : await ctx.agents.resume({
            resumeSessionId: SessionId(resumeSessionId),
            agentOptions: { provider: selection.provider, model: selection.model },
          })
      handles.set(handle.agent.id, handle)
      const ref: ModelSelectionRef = { current: undefined, assembled: undefined }
      modelSelectionDisposers.set(handle.agent.id, installModelSelection(handle.agent.ctx, ref))
      modelSelections.set(handle.agent.id, ref)
      return handle.agent.id
    },
    snapshot,
    events(sessionId: string): readonly SessionEvent[] {
      // Provider-bound sessions have no DSH durable log; an empty log is the
      // honest projection (their updates project through the assistant stream
      // and snapshot, never into a SessionEvent log they did not come from).
      if (providerSessions.has(sessionId)) {
        if (disposed) throw new Error('ACRYL session bridge is disposed')
        return Object.freeze([])
      }
      return agentFor(sessionId).session.snapshotEvents()
    },
    async subscribe(
      sessionId: string,
      listener: (snapshot: AcrylSessionSnapshot) => void,
      _onError?: (error: Error) => void,
    ): Promise<AcrylSessionSubscription> {
      requireActiveSession(sessionId)
      const listeners = subscribers.get(sessionId) ?? new Set()
      subscribers.set(sessionId, listeners)
      listeners.add(listener)
      try {
        listener(await snapshot(sessionId))
      } catch {
        // Presentation listeners cannot disrupt durable session delivery.
      }
      let active = true
      return Object.freeze({
        whenError(): Promise<Error> { return new Promise<Error>(() => {}) },
        async dispose(): Promise<void> {
          if (!active) return
          active = false
          listeners.delete(listener)
          if (listeners.size === 0) subscribers.delete(sessionId)
        },
      })
    },
    async subscribeEvents(
      sessionId: string,
      listener: (event: SessionEvent) => void,
    ): Promise<AcrylSessionEventSubscription> {
      // Provider-bound sessions register normally but never fire — they own no
      // DSH `session/event` stream.
      requireActiveSession(sessionId)
      const listeners = eventListeners.get(sessionId) ?? new Set()
      eventListeners.set(sessionId, listeners)
      listeners.add(listener)
      let active = true
      return Object.freeze({
        async dispose(): Promise<void> {
          if (!active) return
          active = false
          listeners.delete(listener)
          if (listeners.size === 0) eventListeners.delete(sessionId)
        },
      })
    },
    async subscribeAssistantStream(
      sessionId: string,
      listener: (frame: AssistantStreamFrame) => void,
    ): Promise<AcrylSessionEventSubscription> {
      requireActiveSession(sessionId)
      const listeners = assistantStreamListeners.get(sessionId) ?? new Set()
      assistantStreamListeners.set(sessionId, listeners)
      listeners.add(listener)
      let active = true
      return Object.freeze({
        async dispose(): Promise<void> {
          if (!active) return
          active = false
          listeners.delete(listener)
          if (listeners.size === 0) assistantStreamListeners.delete(sessionId)
        },
      })
    },
    async submitPrompt(input: { readonly sessionId: string; readonly text: string }): Promise<void> {
      const providerSession = providerSessions.get(input.sessionId)
      if (providerSession !== undefined) {
        if (disposed) throw new Error('ACRYL session bridge is disposed')
        if (input.text.trim() === '') throw new Error('ACRYL prompt must not be empty')
        const control = agentControl()
        const receipt = await control.dispatch(providerSession.workerId, { kind: 'send', payload: input.text })
        await refreshProviderBinding(control, providerSession)
        providerSession.transcript.push(Object.freeze({
          id: `${providerSession.workerId}-prompt-${providerSession.turn + 1}`,
          author: 'user',
          text: input.text,
        }))
        emitAssistantFrames(providerSession.workerId, projectProviderTurn(providerSession, receipt.result))
        notify(providerSession.workerId)
        return
      }
      const agent = agentFor(input.sessionId)
      if (input.text.trim() === '') throw new Error('ACRYL prompt must not be empty')
      const accepted = new Promise<void>((resolve) => {
        const off = ctx.on('session/event', (session, event) => {
          if (session !== agent.session || event.type !== 'user/message') return
          off()
          resolve()
        })
      })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: input.text }],
        source: { kind: 'user' },
      }))
      await accepted
    },
    async selectModel(input: { readonly sessionId: string; readonly provider: string; readonly model: string }): Promise<void> {
      // `installModelSelection` is a DSH-agent construction; there is no
      // provider-neutral live-model command, so refuse honestly rather than
      // faking a switch.
      if (providerSessions.has(input.sessionId)) {
        throw new Error(`ACRYL provider session ${input.sessionId} does not support live model selection`)
      }
      agentFor(input.sessionId)
      const ref = modelSelections.get(input.sessionId)
      if (ref === undefined) throw new Error(`ACRYL session ${input.sessionId} has no installed model selection`)
      ref.current = { provider: input.provider, model: input.model }
    },
    async cancel(sessionId: string): Promise<void> {
      const providerSession = providerSessions.get(sessionId)
      if (providerSession !== undefined) {
        if (disposed) throw new Error('ACRYL session bridge is disposed')
        const control = agentControl()
        await control.dispatch(providerSession.workerId, { kind: 'cancel', payload: null })
        await refreshProviderBinding(control, providerSession)
        notify(providerSession.workerId)
        return
      }
      agentFor(sessionId).cancel({ kind: 'user' })
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      offSessionEvent()
      offAssistantStream()
      subscribers.clear()
      eventListeners.clear()
      assistantStreamListeners.clear()
      // Provider-bound sessions stop through dispatch; the provider owns the
      // runtime teardown. A vanished control service needs no dispatch — its
      // bindings died with it.
      const boundSessions = [...providerSessions.values()]
      providerSessions.clear()
      if (boundSessions.length !== 0) {
        const control = ctx.get('acrAgentControl')
        for (const session of boundSessions) {
          try {
            await control?.dispatch(session.workerId, { kind: 'stop', payload: null })
          } catch {
            // Releasing a provider binding on dispose is best-effort.
          }
        }
      }
      for (const dispose of modelSelectionDisposers.values()) dispose()
      modelSelectionDisposers.clear()
      modelSelections.clear()
      // Durable continuity: idle the turn, checkpoint the session log, then
      // release the native handle. Mirror of Tomo's shutdown sequence, owned
      // here so every surface gets the same durability guarantee.
      const activeHandles = [...handles.values()]
      handles.clear()
      const sessions = ctx.get('sessions')
      for (const handle of activeHandles) {
        try {
          await handle.agent.whenIdle()
        } catch {
          // A disposing agent has no obligation to be idle; proceed to release.
        }
        try {
          await sessions?.flush(handle.agent.session)
        } catch {
          // Flush is best-effort on dispose; persistence already ran per event.
        }
      }
      await Promise.all(activeHandles.map(handle => handle.dispose()))
    },
  })
}
