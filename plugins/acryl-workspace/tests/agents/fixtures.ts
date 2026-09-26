import type { AgentSettingsEntry, AgentSettingsView } from '../../src/agents/contract.ts'

/** A settings entry for a known agent, installed and enabled unless overridden. */
export function entry(id: string, over: Partial<AgentSettingsEntry> = {}): AgentSettingsEntry {
  return {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    kind: 'known',
    homepageUrl: `https://example.test/${id}`,
    defaultCommand: id,
    command: id,
    args: [],
    permissionArgs: [],
    permissionEnv: {},
    enabled: true,
    installed: true,
    preview: id,
    badge: null,
    ...over,
  }
}

export function view(agents: readonly AgentSettingsEntry[], over: Partial<AgentSettingsView> = {}): AgentSettingsView {
  return { permissions: 'manual', defaultAgent: 'auto', agents, ...over }
}
