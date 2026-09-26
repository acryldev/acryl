/** The custom agents the page knows about, shared by the "+" menu and the tab icons. */

import type { CustomAgent } from '../../agents/definition.ts'
import type { WorkspaceAgentsApi } from './agents-api.ts'

export class AgentsState {
  private agents: readonly CustomAgent[] = []
  private readonly listeners = new Set<() => void>()

  constructor(private readonly api: WorkspaceAgentsApi) {}

  getSnapshot = (): readonly CustomAgent[] => this.agents

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Load the catalog; a Host without the catalog route just means no custom agents. */
  async refresh(): Promise<void> {
    try {
      this.set(await this.api.list())
    } catch {
      this.set([])
    }
  }

  /** @throws an Error whose message says what to fix. */
  async add(agent: CustomAgent): Promise<void> {
    this.set(await this.api.add(agent))
  }

  async remove(id: string): Promise<void> {
    this.set(await this.api.remove(id))
  }

  private set(next: readonly CustomAgent[]): void {
    this.agents = next
    for (const listener of [...this.listeners]) listener()
  }
}
