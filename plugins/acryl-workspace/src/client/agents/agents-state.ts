/** The agents the page knows about, shared by the "+" menu, the tab icons and Settings > Agents. */

import type { AgentSettingsView } from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import type { PreferencesPatch } from '../../agents/preferences.ts'
import type { WorkspaceAgentsApi } from './agents-api.ts'

export class AgentsState {
  private agents: readonly CustomAgent[] = []
  private view: AgentSettingsView | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly api: WorkspaceAgentsApi) {}

  /** The user's own agents. */
  getSnapshot = (): readonly CustomAgent[] => this.agents

  /** Settings and detection for every agent, or null until the Host has answered (or when it has no such route). */
  getSettings = (): AgentSettingsView | null => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Load the catalog and the settings; a Host without the routes just means no custom agents and no settings. */
  async refresh(): Promise<void> {
    try {
      this.agents = await this.api.list()
    } catch {
      this.agents = []
    }
    try {
      this.view = await this.api.settings()
    } catch {
      this.view = null
    }
    this.notify()
  }

  /** @throws an Error whose message says what to fix. */
  async add(agent: CustomAgent): Promise<void> {
    this.agents = await this.api.add(agent)
    await this.reloadSettings()
  }

  async remove(id: string): Promise<void> {
    this.agents = await this.api.remove(id)
    await this.reloadSettings()
  }

  /** @throws an Error whose message says what to fix. */
  async change(patch: PreferencesPatch): Promise<void> {
    this.view = await this.api.change(patch)
    this.notify()
  }

  private async reloadSettings(): Promise<void> {
    try {
      this.view = await this.api.settings()
    } catch {
      this.view = null
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
