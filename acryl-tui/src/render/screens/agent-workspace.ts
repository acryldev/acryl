/** Read-only terminal projection of durable agent-session records. */

export type AgentSessionStatus = 'idle' | 'running' | 'waiting' | 'stopped' | 'failed'
export type AgentTranscriptAuthor = 'user' | 'assistant' | 'system'
export type AgentToolStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type AgentJobStatus = 'queued' | 'running' | 'stopping' | 'succeeded' | 'failed' | 'cancelled'

export interface AgentSessionListItem {
  readonly id: string
  readonly title: string
  readonly status: AgentSessionStatus
}

export interface AgentTranscriptBlock {
  readonly id: string
  readonly author: AgentTranscriptAuthor
  readonly text: string
}

export interface AgentToolCard {
  readonly callId: string
  readonly toolName: string
  readonly status: AgentToolStatus
  readonly summary: string
}

export interface AgentApprovalCard {
  readonly id: string
  readonly toolName: string
  readonly status: AgentApprovalStatus
  readonly reason: string
}

export interface AgentJobCard {
  readonly id: string
  readonly label: string
  readonly status: AgentJobStatus
}

export interface AgentComposerState {
  readonly enabled: boolean
  readonly placeholder: string
}

/**
 * Read-only source assembled from Harness durable session/trajectory records.
 * It intentionally carries no raw PTY bytes or terminal scrollback.
 */
export interface DurableAgentWorkspaceSource {
  readonly sessions: readonly AgentSessionListItem[]
  readonly selectedSessionId: string | null
  readonly transcript: readonly AgentTranscriptBlock[]
  readonly toolCards: readonly AgentToolCard[]
  readonly approvals: readonly AgentApprovalCard[]
  readonly jobs: readonly AgentJobCard[]
  readonly composer: AgentComposerState
}

export interface AgentWorkspaceScreen {
  readonly sessions: readonly AgentSessionListItem[]
  readonly selectedSessionId: string | null
  readonly sessionControls: {
    readonly canCreate: boolean
    readonly resumeSessionId: string | null
  }
  readonly transcript: readonly AgentTranscriptBlock[]
  readonly toolCards: readonly AgentToolCard[]
  readonly approvals: readonly AgentApprovalCard[]
  readonly jobs: readonly AgentJobCard[]
  readonly composer: AgentComposerState
}

function unique<T extends { readonly id: string }>(items: readonly T[], label: string): readonly T[] {
  const ids = new Set<string>()
  for (const item of items) {
    if (item.id.trim() === '') throw new Error(`agent workspace ${label} id must not be empty`)
    if (ids.has(item.id)) throw new Error(`duplicate ${label} id: ${item.id}`)
    ids.add(item.id)
  }
  return Object.freeze(items.map(item => Object.freeze({ ...item })))
}

function uniqueToolCards(items: readonly AgentToolCard[]): readonly AgentToolCard[] {
  const ids = new Set<string>()
  for (const item of items) {
    if (item.callId.trim() === '') throw new Error('agent workspace tool call id must not be empty')
    if (ids.has(item.callId)) throw new Error(`duplicate tool call id: ${item.callId}`)
    ids.add(item.callId)
  }
  return Object.freeze(items.map(item => Object.freeze({ ...item })))
}

/** Validate and freeze one complete terminal workspace screen projection. */
export function projectAgentWorkspace(source: DurableAgentWorkspaceSource): AgentWorkspaceScreen {
  const sessions = unique(source.sessions, 'session')
  if (source.selectedSessionId !== null && !sessions.some(session => session.id === source.selectedSessionId)) {
    throw new Error(`selected session is absent from durable session list: ${source.selectedSessionId}`)
  }
  const transcript = unique(source.transcript, 'transcript block')
  const approvals = unique(source.approvals, 'approval')
  const jobs = unique(source.jobs, 'job')
  if (source.composer.placeholder.trim() === '') {
    throw new Error('agent workspace composer placeholder must not be empty')
  }
  return Object.freeze({
    sessions,
    selectedSessionId: source.selectedSessionId,
    sessionControls: Object.freeze({
      canCreate: true,
      resumeSessionId: source.selectedSessionId,
    }),
    transcript,
    toolCards: uniqueToolCards(source.toolCards),
    approvals,
    jobs,
    composer: Object.freeze({ ...source.composer }),
  })
}

function lines<T>(title: string, items: readonly T[], render: (item: T) => string): string[] {
  return [title, ...(items.length === 0 ? ['(none)'] : items.map(render))]
}

/** Format the complete screen without treating rendered text as state. */
export function formatAgentWorkspaceScreen(screen: AgentWorkspaceScreen): string {
  return [
    ...lines('Sessions', screen.sessions, session => `${session.id === screen.selectedSessionId ? '* ' : '  '}${session.title} [${session.status}]`),
    `[new session]${screen.sessionControls.resumeSessionId === null ? '' : ` [resume ${screen.sessionControls.resumeSessionId}]`}`,
    ...lines('Transcript', screen.transcript, block => `${block.author}: ${block.text}`),
    ...lines('Tools', screen.toolCards, card => `${card.toolName} [${card.status}]: ${card.summary}`),
    ...lines('Approvals', screen.approvals, approval => `${approval.toolName} [${approval.status}]: ${approval.reason}`),
    ...lines('Jobs', screen.jobs, job => `${job.label} [${job.status}]`),
    'Composer',
    `${screen.composer.enabled ? '' : '[disabled] '}${screen.composer.placeholder}`,
  ].join('\n')
}
