export type AcrylSessionAttachment = 'owner' | 'attached'
export type AcrylSessionAgentStatus = 'idle' | 'running' | 'waiting' | 'failed'
export type AcrylTranscriptAuthor = 'user' | 'assistant'
export type AcrylToolStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AcrylTranscriptItem {
  readonly id: string
  readonly author: AcrylTranscriptAuthor
  readonly text: string
}

export interface AcrylToolProjection {
  readonly callId: string
  readonly name: string
  readonly status: AcrylToolStatus
}

export interface AcrylSessionSnapshot {
  readonly profile: string
  readonly generationId: string
  readonly attachment: AcrylSessionAttachment
  readonly sessionId: string
  readonly agentStatus: AcrylSessionAgentStatus
  readonly transcript: readonly AcrylTranscriptItem[]
  readonly tools: readonly AcrylToolProjection[]
}

export interface AcrylSessionSubscription {
  dispose(): Promise<void>
}

export interface AcrylSessionClient {
  snapshot(sessionId: string): Promise<AcrylSessionSnapshot>
  subscribe(
    sessionId: string,
    listener: (snapshot: AcrylSessionSnapshot) => void,
  ): Promise<AcrylSessionSubscription>
  submitPrompt(input: {
    readonly sessionId: string
    readonly text: string
    readonly clientCommandId: string
  }): Promise<void>
  cancel(input: { readonly sessionId: string }): Promise<void>
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function nonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
  return value
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  message: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(message)
  return value as T
}

function parseTranscript(value: unknown): readonly AcrylTranscriptItem[] {
  if (!Array.isArray(value)) throw new Error('invalid ACRYL transcript')
  return Object.freeze(value.map((item) => {
    const source = record(item)
    if (source === undefined) throw new Error('invalid ACRYL transcript item')
    return Object.freeze({
      id: nonEmpty(source.id, 'invalid ACRYL transcript id'),
      author: oneOf(source.author, ['user', 'assistant'], 'invalid ACRYL transcript author'),
      text: nonEmpty(source.text, 'invalid ACRYL transcript text'),
    })
  }))
}

function parseTools(value: unknown): readonly AcrylToolProjection[] {
  if (!Array.isArray(value)) throw new Error('invalid ACRYL tool projections')
  return Object.freeze(value.map((item) => {
    const source = record(item)
    if (source === undefined) throw new Error('invalid ACRYL tool projection')
    return Object.freeze({
      callId: nonEmpty(source.callId, 'invalid ACRYL tool call id'),
      name: nonEmpty(source.name, 'invalid ACRYL tool name'),
      status: oneOf(source.status, ['pending', 'running', 'succeeded', 'failed'], 'invalid ACRYL tool status'),
    })
  }))
}

/** Validate an untrusted control-plane session projection at the boundary. */
export function parseAcrylSessionSnapshot(value: unknown): AcrylSessionSnapshot {
  const source = record(value)
  if (source === undefined) throw new Error('invalid ACRYL session snapshot')
  return Object.freeze({
    profile: nonEmpty(source.profile, 'invalid ACRYL profile'),
    generationId: nonEmpty(source.generationId, 'invalid ACRYL generation id'),
    attachment: oneOf(source.attachment, ['owner', 'attached'], 'invalid ACRYL attachment mode'),
    sessionId: nonEmpty(source.sessionId, 'invalid ACRYL session id'),
    agentStatus: oneOf(source.agentStatus, ['idle', 'running', 'waiting', 'failed'], 'invalid ACRYL agent status'),
    transcript: parseTranscript(source.transcript),
    tools: parseTools(source.tools),
  })
}
