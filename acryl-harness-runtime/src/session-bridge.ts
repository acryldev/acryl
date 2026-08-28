import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {
  AcrylSessionAttachment,
  AcrylSessionSnapshot,
  AcrylSessionSubscription,
  AcrylToolProjection,
  AcrylTranscriptItem,
} from 'acryl-control'

export interface AcrylSessionBridgeOptions {
  readonly profile: string
  readonly attachment: AcrylSessionAttachment
  readonly cwd: string
}

export interface AcrylSessionBridge {
  open(resumeSessionId?: string): Promise<string>
  snapshot(sessionId: string): Promise<AcrylSessionSnapshot>
  subscribe(
    sessionId: string,
    listener: (snapshot: AcrylSessionSnapshot) => void,
  ): Promise<AcrylSessionSubscription>
  submitPrompt(input: { readonly sessionId: string; readonly text: string }): Promise<void>
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

/**
 * Runtime-owned adapter over one native DSH agent/session. It creates or resumes
 * the native agent and derives every presentation value from its durable log.
 */
export function createAcrylSessionBridge(
  ctx: Context,
  options: AcrylSessionBridgeOptions,
): AcrylSessionBridge {
  const handles = new Map<string, AgentHandle>()
  const subscribers = new Map<string, Set<(snapshot: AcrylSessionSnapshot) => void>>()
  let disposed = false

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
  const offSessionEvent = ctx.on('session/event', (session) => {
    if (handles.has(session.id)) notify(session.id)
  })

  const snapshot = async (sessionId: string): Promise<AcrylSessionSnapshot> => {
    const agent = agentFor(sessionId)
    return Object.freeze({
      profile: options.profile,
      generationId: 'runtime-local',
      attachment: options.attachment,
      sessionId: agent.id,
      agentStatus: status(agent),
      transcript: transcript(agent.session.events),
      tools: tools(agent.session.events),
    })
  }

  const agentFor = (sessionId: string): Agent => {
    if (disposed) throw new Error('ACRYL session bridge is disposed')
    const handle = handles.get(sessionId)
    if (handle === undefined) throw new Error(`ACRYL session ${sessionId} is not active`)
    return handle.agent
  }

  return Object.freeze({
    async open(resumeSessionId?: string): Promise<string> {
      if (disposed) throw new Error('ACRYL session bridge is disposed')
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
      return handle.agent.id
    },
    snapshot,
    async subscribe(
      sessionId: string,
      listener: (snapshot: AcrylSessionSnapshot) => void,
    ): Promise<AcrylSessionSubscription> {
      agentFor(sessionId)
      const listeners = subscribers.get(sessionId) ?? new Set()
      subscribers.set(sessionId, listeners)
      listeners.add(listener)
      listener(await snapshot(sessionId))
      let active = true
      return Object.freeze({
        async dispose(): Promise<void> {
          if (!active) return
          active = false
          listeners.delete(listener)
          if (listeners.size === 0) subscribers.delete(sessionId)
        },
      })
    },
    async submitPrompt(input: { readonly sessionId: string; readonly text: string }): Promise<void> {
      const agent = agentFor(input.sessionId)
      if (input.text.trim() === '') throw new Error('ACRYL prompt must not be empty')
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: input.text }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
    }, 
    async cancel(sessionId: string): Promise<void> {
      agentFor(sessionId).cancel({ kind: 'user' })
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      offSessionEvent()
      subscribers.clear()
      await Promise.all([...handles.values()].map(handle => handle.dispose()))
      handles.clear()
    },
  })
}
