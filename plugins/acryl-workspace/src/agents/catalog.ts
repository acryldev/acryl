/**
 * The user's custom agents: the use cases (list, add, remove, resolve) over a store.
 *
 * The store and the check that a command really exists are ports, so these rules run with no disk and no
 * process table. The catalog is the only source of custom agents; a worktree can never contribute one.
 */

import { AgentDefinitionError, MAX_CUSTOM_AGENTS, parseCustomAgent, type CustomAgent } from './definition.ts'

/** Where the definitions are kept (a file in the user's own ACRYL home). */
export interface CatalogStore {
  /** @returns the stored JSON text, or null when nothing was stored yet. */
  read(): Promise<string | null>
  write(text: string): Promise<void>
}

/** Answers whether a command names a real executable on this machine. */
export type CommandExists = (command: string) => boolean

export interface AgentLaunch {
  readonly command: string
  readonly args: readonly string[]
}

export class AgentCatalog {
  private agents: readonly CustomAgent[] = []
  private loaded = false

  constructor(private readonly store: CatalogStore, private readonly commandExists: CommandExists) {}

  /** Read the stored definitions; a damaged file is ignored (built-in agents keep working). */
  async load(): Promise<void> {
    this.loaded = true
    try {
      const text = await this.store.read()
      const parsed: unknown = text === null ? [] : JSON.parse(text)
      if (!Array.isArray(parsed)) return
      const good: CustomAgent[] = []
      for (const item of parsed) {
        try {
          const agent = parseCustomAgent(item)
          if (!good.some(existing => existing.id === agent.id)) good.push(agent)
        } catch {
          // One bad entry does not take the others down.
        }
      }
      this.agents = good.slice(0, MAX_CUSTOM_AGENTS)
    } catch {
      this.agents = []
    }
  }

  list(): readonly CustomAgent[] {
    return this.agents
  }

  /** @returns what to launch for a custom agent id, or undefined when the id is not one. */
  resolve(id: string): AgentLaunch | undefined {
    const agent = this.agents.find(candidate => candidate.id === id)
    return agent === undefined ? undefined : { command: agent.command, args: agent.args }
  }

  /** @throws AgentDefinitionError for an invalid, duplicate, or unrunnable definition. */
  async add(raw: unknown): Promise<CustomAgent> {
    if (!this.loaded) await this.load()
    const agent = parseCustomAgent(raw)
    if (this.agents.some(existing => existing.id === agent.id)) throw new AgentDefinitionError(`"${agent.id}" already exists`)
    if (this.agents.length >= MAX_CUSTOM_AGENTS) throw new AgentDefinitionError(`at most ${String(MAX_CUSTOM_AGENTS)} custom agents`)
    if (!this.commandExists(agent.command)) throw new AgentDefinitionError(`"${agent.command}" was not found on this machine`)
    const next = [...this.agents, agent]
    await this.store.write(JSON.stringify(next, null, 2))
    this.agents = next
    return agent
  }

  /** Idempotent. */
  async remove(id: string): Promise<void> {
    if (!this.loaded) await this.load()
    if (!this.agents.some(agent => agent.id === id)) return
    const next = this.agents.filter(agent => agent.id !== id)
    await this.store.write(JSON.stringify(next, null, 2))
    this.agents = next
  }
}
