/** Loopback routes and JSON shapes for the custom agent catalog. */

import { parseCustomAgent, type CustomAgent } from './definition.ts'

/** GET the catalog; POST `{ agent }` to add one. */
export const WORKSPACE_AGENTS_PATH = '/api/acryl-workspace/agents'
/** POST `{ id }` to remove one. */
export const WORKSPACE_AGENTS_REMOVE_PATH = '/api/acryl-workspace/agents/remove'

export interface AgentsView {
  readonly agents: readonly CustomAgent[]
}

/** @param value - unknown JSON from the agents routes. */
export function parseAgentsView(value: unknown): AgentsView {
  if (typeof value !== 'object' || value === null || !('agents' in value) || !Array.isArray(value.agents)) {
    throw new Error('invalid agents response')
  }
  return { agents: value.agents.map(item => parseCustomAgent(item)) }
}
