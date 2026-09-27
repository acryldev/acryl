/** Same-origin client for the agent status list (what each terminal agent reports it is doing). */

import { AGENT_STATES, WORKSPACE_AGENT_STATUS_PATH, type AgentState, type AgentStatus } from '../../agents/status/agent-status.ts'

export interface AgentStatusApi {
  list(): Promise<readonly AgentStatus[]>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const isState = (value: unknown): value is AgentState => (AGENT_STATES as readonly unknown[]).includes(value)

/** @param value - unknown JSON from the route. @throws Error when it is not the expected shape. */
export function parseStatuses(value: unknown): AgentStatus[] {
  if (typeof value !== 'object' || value === null || !('statuses' in value) || !Array.isArray(value.statuses)) throw new Error('invalid agent status response')
  return value.statuses.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { terminalId, state, at } = entry as Record<string, unknown>
    return typeof terminalId === 'string' && isState(state) && typeof at === 'number' ? [{ terminalId, state, at }] : []
  })
}

export function createAgentStatusApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): AgentStatusApi {
  return {
    async list() {
      const response = await fetchImpl(WORKSPACE_AGENT_STATUS_PATH, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`agent status request failed (HTTP ${String(response.status)})`)
      return parseStatuses(await response.json())
    },
  }
}
