/**
 * What a terminal agent is doing right now, as the agent itself reports it (spec 040 T127).
 *
 * Reading this off the screen would be guessing, so the agents that support hooks tell ACRYL instead: Claude Code
 * runs a small command on "prompt submitted", "tool finished", "needs you" and "turn finished", and that command
 * posts the state here. The store keeps the latest state per terminal and only ever answers for terminals the Host
 * still has.
 */

/** GET from the page: every live terminal's status. POST from an agent's hook: one report. */
export const WORKSPACE_AGENT_STATUS_PATH = '/api/acryl-workspace/agent-status'

export const AGENT_STATES = ['working', 'waiting', 'done'] as const
/** `working`: busy. `waiting`: it needs you (a permission, a question). `done`: it finished its turn. */
export type AgentState = (typeof AGENT_STATES)[number]

export interface AgentStatus {
  readonly terminalId: string
  readonly state: AgentState
  /** Milliseconds since the epoch when it was reported. */
  readonly at: number
}

export class AgentStatusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentStatusError'
  }
}

const isState = (value: unknown): value is AgentState => (AGENT_STATES as readonly unknown[]).includes(value)

/** @param body - untrusted JSON from a hook. @throws AgentStatusError. */
export function parseStatusReport(body: unknown): { readonly terminal: string; readonly state: AgentState } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AgentStatusError('a report is an object')
  const record = body as Record<string, unknown>
  const extra = Object.keys(record).find(key => key !== 'terminal' && key !== 'state')
  if (extra !== undefined) throw new AgentStatusError(`unknown field: ${extra}`)
  const { terminal, state } = record
  if (typeof terminal !== 'string' || terminal.length === 0 || terminal.length > 80) throw new AgentStatusError('terminal must be a terminal id')
  if (!isState(state)) throw new AgentStatusError('state is working, waiting or done')
  return { terminal, state }
}

export class AgentStatusStore {
  private readonly statuses = new Map<string, AgentStatus>()

  /** @param isLive - whether the Host still has a terminal with this id. @param now - the clock. */
  constructor(private readonly isLive: (terminalId: string) => boolean, private readonly now: () => number = Date.now) {}

  /** @returns false when no such terminal exists (a stale or forged report is ignored). */
  report(terminalId: string, state: AgentState): boolean {
    if (!this.isLive(terminalId)) return false
    this.statuses.set(terminalId, { terminalId, state, at: this.now() })
    return true
  }

  /** The latest status of every terminal that still exists; the others are forgotten here. */
  list(): readonly AgentStatus[] {
    for (const id of [...this.statuses.keys()]) {
      if (!this.isLive(id)) this.statuses.delete(id)
    }
    return [...this.statuses.values()]
  }
}
