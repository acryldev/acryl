/**
 * The user's agent preferences: the permission mode, the default agent, and per-agent overrides. Pure rules for
 * reading the stored file and for applying one change at a time; the file itself is a port (`file-store.ts`).
 */

import { AgentDefinitionError, parseAgentArgs, parseAgentCommand } from './definition.ts'
import { DEFAULT_OVERRIDE, type AgentOverride } from './launch.ts'
import type { PermissionMode } from './known-agents.ts'

/** `auto`: follow what was opened last. `none`: a blank terminal. Otherwise an agent id. */
export type DefaultAgent = string

export interface AgentPreferences {
  readonly permissions: PermissionMode
  readonly defaultAgent: DefaultAgent
  readonly overrides: Readonly<Record<string, AgentOverride>>
}

/** Manual is the default: an agent that skips approvals is something the user turns on. */
export const DEFAULT_PREFERENCES: AgentPreferences = { permissions: 'manual', defaultAgent: 'auto', overrides: {} }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const isMode = (value: unknown): value is PermissionMode => value === 'yolo' || value === 'manual'

function parseOverride(value: unknown): AgentOverride {
  if (!isRecord(value)) throw new AgentDefinitionError('an override is an object')
  const { enabled, command, args } = value
  if (enabled !== undefined && typeof enabled !== 'boolean') throw new AgentDefinitionError('enabled is true or false')
  return {
    enabled: enabled ?? true,
    ...(command === undefined ? {} : { command: parseAgentCommand(command) }),
    args: parseAgentArgs(args),
  }
}

/** @param value - the parsed stored JSON. A damaged file gives the defaults; one bad override is dropped. */
export function parseStoredPreferences(value: unknown): AgentPreferences {
  if (!isRecord(value)) return DEFAULT_PREFERENCES
  const overrides: Record<string, AgentOverride> = {}
  if (isRecord(value.overrides)) {
    for (const [id, raw] of Object.entries(value.overrides)) {
      try { overrides[id] = parseOverride(raw) } catch { /* one bad entry does not take the others down */ }
    }
  }
  return {
    permissions: isMode(value.permissions) ? value.permissions : DEFAULT_PREFERENCES.permissions,
    defaultAgent: typeof value.defaultAgent === 'string' && value.defaultAgent !== '' ? value.defaultAgent : DEFAULT_PREFERENCES.defaultAgent,
    overrides,
  }
}

/** One change from Settings. `command: null` clears the override. */
export interface PreferencesPatch {
  readonly permissions?: PermissionMode
  readonly defaultAgent?: DefaultAgent
  readonly agent?: {
    readonly id: string
    readonly enabled?: boolean
    readonly command?: string | null
    readonly args?: readonly string[]
  }
}

/** @param value - untrusted JSON from the route. @throws AgentDefinitionError with a message fit to show. */
export function parsePreferencesPatch(value: unknown): PreferencesPatch {
  if (!isRecord(value)) throw new AgentDefinitionError('invalid agent settings request')
  const extra = Object.keys(value).find(key => key !== 'permissions' && key !== 'defaultAgent' && key !== 'agent')
  if (extra !== undefined) throw new AgentDefinitionError(`unknown field: ${extra}`)
  const patch: { permissions?: PermissionMode; defaultAgent?: DefaultAgent; agent?: NonNullable<PreferencesPatch['agent']> } = {}
  if (value.permissions !== undefined) {
    if (!isMode(value.permissions)) throw new AgentDefinitionError('permissions is yolo or manual')
    patch.permissions = value.permissions
  }
  if (value.defaultAgent !== undefined) {
    if (typeof value.defaultAgent !== 'string' || value.defaultAgent === '' || value.defaultAgent.length > 40) throw new AgentDefinitionError('defaultAgent is auto, none or an agent id')
    patch.defaultAgent = value.defaultAgent
  }
  if (value.agent !== undefined) {
    const agent = value.agent
    if (!isRecord(agent) || typeof agent.id !== 'string' || agent.id === '' || agent.id.length > 40) throw new AgentDefinitionError('an agent change needs an id')
    const unknown = Object.keys(agent).find(key => !['id', 'enabled', 'command', 'args'].includes(key))
    if (unknown !== undefined) throw new AgentDefinitionError(`unknown field: ${unknown}`)
    if (agent.enabled !== undefined && typeof agent.enabled !== 'boolean') throw new AgentDefinitionError('enabled is true or false')
    patch.agent = {
      id: agent.id,
      ...(agent.enabled === undefined ? {} : { enabled: agent.enabled }),
      ...(agent.command === undefined ? {} : { command: agent.command === null ? null : parseAgentCommand(agent.command) }),
      ...(agent.args === undefined ? {} : { args: parseAgentArgs(agent.args) }),
    }
  }
  return patch
}

/**
 * @param current - the preferences now.
 * @param patch - one validated change.
 * @param isAgent - whether an id names an agent the Host knows (built in or custom).
 * @throws AgentDefinitionError for an unknown agent.
 */
export function applyPreferencesPatch(current: AgentPreferences, patch: PreferencesPatch, isAgent: (id: string) => boolean): AgentPreferences {
  let next = current
  if (patch.permissions !== undefined) next = { ...next, permissions: patch.permissions }
  if (patch.defaultAgent !== undefined) {
    if (patch.defaultAgent !== 'auto' && patch.defaultAgent !== 'none' && !isAgent(patch.defaultAgent)) throw new AgentDefinitionError(`"${patch.defaultAgent}" is not an agent`)
    next = { ...next, defaultAgent: patch.defaultAgent }
  }
  if (patch.agent !== undefined) {
    const { id, enabled, command, args } = patch.agent
    if (!isAgent(id)) throw new AgentDefinitionError(`"${id}" is not an agent`)
    const before = next.overrides[id] ?? DEFAULT_OVERRIDE
    const { command: oldCommand, ...rest } = before
    const commandPart = command === undefined ? (oldCommand === undefined ? {} : { command: oldCommand }) : command === null ? {} : { command }
    next = { ...next, overrides: { ...next.overrides, [id]: { ...rest, enabled: enabled ?? before.enabled, args: args ?? before.args, ...commandPart } } }
  }
  return next
}
