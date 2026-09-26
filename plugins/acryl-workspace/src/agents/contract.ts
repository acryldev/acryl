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

/** GET the settings view; POST a {@link PreferencesPatch} to change one thing. Both answer with the whole view. */
export const WORKSPACE_AGENT_SETTINGS_PATH = '/api/acryl-workspace/agents/settings'

/** One row of Settings > Agents. */
export interface AgentSettingsEntry {
  readonly id: string
  readonly label: string
  readonly kind: 'known' | 'custom'
  /** The agent's install page (known agents only). */
  readonly homepageUrl: string | null
  /** The executable the agent ships with. */
  readonly defaultCommand: string
  /** What runs: the user's replacement when set, otherwise {@link defaultCommand}. */
  readonly command: string
  /** The user's extra arguments (known agents), or the definition's own arguments (custom agents). */
  readonly args: readonly string[]
  /** What the permission mode adds right now. */
  readonly permissionArgs: readonly string[]
  readonly permissionEnv: Readonly<Record<string, string>>
  readonly enabled: boolean
  /** The executable was found on this machine. */
  readonly installed: boolean
  /** The exact command line a new tab runs. */
  readonly preview: string
  /** Custom agents only: the badge chosen when it was added. */
  readonly badge: { readonly letter: string; readonly color: string } | null
}

export interface AgentSettingsView {
  readonly permissions: 'yolo' | 'manual'
  /** `auto`, `none`, or the id of an existing agent. */
  readonly defaultAgent: string
  readonly agents: readonly AgentSettingsEntry[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

function parseEntry(value: unknown): AgentSettingsEntry {
  if (!isObject(value)) throw new Error('invalid agent settings entry')
  const { id, label, kind, homepageUrl, defaultCommand, command, args, permissionArgs, permissionEnv, enabled, installed, preview, badge } = value
  if (typeof id !== 'string' || typeof label !== 'string' || (kind !== 'known' && kind !== 'custom')
    || (homepageUrl !== null && typeof homepageUrl !== 'string') || typeof defaultCommand !== 'string' || typeof command !== 'string'
    || !isStringArray(args) || !isStringArray(permissionArgs) || !isObject(permissionEnv)
    || !Object.values(permissionEnv).every(item => typeof item === 'string')
    || typeof enabled !== 'boolean' || typeof installed !== 'boolean' || typeof preview !== 'string') {
    throw new Error('invalid agent settings entry')
  }
  const parsedBadge = isObject(badge) && typeof badge.letter === 'string' && typeof badge.color === 'string' ? { letter: badge.letter, color: badge.color } : null
  return { id, label, kind, homepageUrl, defaultCommand, command, args, permissionArgs, permissionEnv: permissionEnv as Record<string, string>, enabled, installed, preview, badge: parsedBadge }
}

/** @param value - unknown JSON from the settings route. */
export function parseAgentSettingsView(value: unknown): AgentSettingsView {
  if (!isObject(value) || (value.permissions !== 'yolo' && value.permissions !== 'manual') || typeof value.defaultAgent !== 'string' || !Array.isArray(value.agents)) {
    throw new Error('invalid agent settings response')
  }
  return { permissions: value.permissions, defaultAgent: value.defaultAgent, agents: value.agents.map(parseEntry) }
}
