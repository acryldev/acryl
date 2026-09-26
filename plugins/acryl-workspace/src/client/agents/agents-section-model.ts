/** Pure view rules for Settings > Agents and for what the "+" menu lists. */

import type { AgentSettingsEntry, AgentSettingsView } from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import { KNOWN_AGENTS } from '../../agents/known-agents.ts'

export interface AgentGroups {
  /** Found on this machine, plus every custom agent (which the user put there on purpose). */
  readonly installed: readonly AgentSettingsEntry[]
  /** Known agents that are not installed here: the ones to try. */
  readonly available: readonly AgentSettingsEntry[]
}

/** @returns the two lists Settings shows, each in the order the agents are known. */
export function groupAgents(view: AgentSettingsView): AgentGroups {
  return {
    installed: view.agents.filter(entry => entry.installed || entry.kind === 'custom'),
    available: view.agents.filter(entry => !entry.installed && entry.kind === 'known'),
  }
}

export interface DefaultChoice {
  readonly id: string
  readonly label: string
}

/** The default-agent chips: automatic, a blank terminal, then every agent that could be launched. */
export function defaultChoices(view: AgentSettingsView): readonly DefaultChoice[] {
  return [
    { id: 'auto', label: 'Auto (last used)' },
    { id: 'none', label: 'No agent (blank terminal)' },
    ...view.agents.filter(entry => entry.installed && entry.enabled).map(entry => ({ id: entry.id, label: entry.label })),
  ]
}

/** One agent as the "+" menu lists it. */
export interface MenuAgent {
  readonly id: string
  readonly label: string
  /** The badge a custom agent chose (built-in agents draw their own). */
  readonly custom?: { readonly letter: string; readonly color: string }
  readonly isDefault: boolean
}

/**
 * The agents the "+" menu lists: installed and enabled ones, and enabled custom ones. Until the Host has
 * answered (or on a Host without settings) every known agent is listed, as before there were settings.
 */
export function menuAgents(view: AgentSettingsView | null, customAgents: readonly CustomAgent[]): readonly MenuAgent[] {
  if (view === null) {
    return [
      ...KNOWN_AGENTS.map(agent => ({ id: agent.id, label: agent.label, isDefault: false })),
      ...customAgents.map(agent => ({ id: agent.id, label: agent.label, custom: agent.badge, isDefault: false })),
    ]
  }
  return view.agents
    .filter(entry => entry.enabled && (entry.installed || entry.kind === 'custom'))
    .map(entry => ({
      id: entry.id,
      label: entry.label,
      ...(entry.badge === null ? {} : { custom: entry.badge }),
      isDefault: view.defaultAgent === entry.id,
    }))
}

/** What the plain "+" button opens. `last` means "whatever was opened last". */
export type PrimaryAction =
  | { readonly kind: 'last' }
  | { readonly kind: 'terminal' }
  | { readonly kind: 'agent'; readonly id: string; readonly label: string }

/** @returns the default agent's action; a default that is unavailable falls back to the last opened tab. */
export function primaryAction(view: AgentSettingsView | null): PrimaryAction {
  if (view === null || view.defaultAgent === 'auto') return { kind: 'last' }
  if (view.defaultAgent === 'none') return { kind: 'terminal' }
  const entry = view.agents.find(candidate => candidate.id === view.defaultAgent)
  return entry !== undefined && entry.enabled && (entry.installed || entry.kind === 'custom')
    ? { kind: 'agent', id: entry.id, label: entry.label }
    : { kind: 'last' }
}
