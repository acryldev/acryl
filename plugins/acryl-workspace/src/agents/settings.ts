/**
 * Agent settings: the preferences file plus everything a launch and Settings > Agents need from it.
 *
 * It answers three questions: what does this id run (`resolve`), what does Settings show (`view`), and what
 * changed (`apply`). The file and the "is this program installed" check are ports, so all of it runs in a test
 * with no disk and no process table. A custom agent is still defined only in the catalog; settings never adds one.
 */

import type { AgentCatalog, CatalogStore, CommandExists } from './catalog.ts'
import type { AgentSettingsEntry, AgentSettingsView } from './contract.ts'
import { DEFAULT_OVERRIDE, describeLaunch, planKnownLaunch, type AgentLaunch } from './launch.ts'
import { KNOWN_AGENTS, knownAgent } from './known-agents.ts'
import { applyPreferencesPatch, DEFAULT_PREFERENCES, parseStoredPreferences, type AgentPreferences, type PreferencesPatch } from './preferences.ts'

export class AgentSettings {
  private preferences: AgentPreferences = DEFAULT_PREFERENCES
  private loaded = false

  constructor(
    private readonly store: CatalogStore,
    private readonly catalog: Pick<AgentCatalog, 'list' | 'resolve'>,
    private readonly commandExists: CommandExists,
  ) {}

  /** Read the stored preferences; a damaged file gives the defaults. */
  async load(): Promise<void> {
    this.loaded = true
    try {
      const text = await this.store.read()
      this.preferences = text === null ? DEFAULT_PREFERENCES : parseStoredPreferences(JSON.parse(text))
    } catch {
      this.preferences = DEFAULT_PREFERENCES
    }
  }

  /** @returns what to run for an agent id (a known agent with the user's settings, or a custom agent), or undefined. */
  resolve(id: string): AgentLaunch | undefined {
    const known = knownAgent(id)
    if (known !== undefined) return planKnownLaunch(known, this.preferences.overrides[id] ?? DEFAULT_OVERRIDE, this.preferences.permissions)
    return this.catalog.resolve(id)
  }

  /** @throws AgentDefinitionError for an unknown agent or an invalid value. */
  async apply(patch: PreferencesPatch): Promise<AgentSettingsView> {
    if (!this.loaded) await this.load()
    const next = applyPreferencesPatch(this.preferences, patch, id => this.isAgent(id))
    await this.store.write(JSON.stringify(next, null, 2))
    this.preferences = next
    return this.view()
  }

  /** The list Settings shows: known agents first, then the user's own. Detection is fresh on every call. */
  view(): AgentSettingsView {
    const { permissions, overrides } = this.preferences
    const known: AgentSettingsEntry[] = KNOWN_AGENTS.map((agent) => {
      const override = overrides[agent.id] ?? DEFAULT_OVERRIDE
      const launch = planKnownLaunch(agent, override, permissions)
      return {
        id: agent.id,
        label: agent.label,
        kind: 'known',
        homepageUrl: agent.homepageUrl,
        defaultCommand: agent.command,
        command: launch.command,
        args: override.args,
        permissionArgs: permissions === 'yolo' ? agent.yoloArgs : [],
        permissionEnv: permissions === 'yolo' ? agent.yoloEnv ?? {} : {},
        enabled: override.enabled,
        installed: this.commandExists(launch.command),
        preview: describeLaunch(launch),
        badge: null,
      }
    })
    const custom: AgentSettingsEntry[] = this.catalog.list().map(agent => ({
      id: agent.id,
      label: agent.label,
      kind: 'custom',
      homepageUrl: null,
      defaultCommand: agent.command,
      command: agent.command,
      args: agent.args,
      permissionArgs: [],
      permissionEnv: {},
      enabled: (overrides[agent.id] ?? DEFAULT_OVERRIDE).enabled,
      installed: this.commandExists(agent.command),
      preview: describeLaunch({ command: agent.command, args: agent.args }),
      badge: agent.badge,
    }))
    const agents = [...known, ...custom]
    // A default that no longer names an agent (a removed custom agent) reads as automatic.
    const stored = this.preferences.defaultAgent
    const defaultAgent = stored === 'auto' || stored === 'none' || agents.some(entry => entry.id === stored) ? stored : 'auto'
    return { permissions, defaultAgent, agents }
  }

  private isAgent(id: string): boolean {
    return knownAgent(id) !== undefined || this.catalog.list().some(agent => agent.id === id)
  }
}
