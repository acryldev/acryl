/** How many agents are working right now, and how to say so. */

/** The slice of a session row the count needs (a `SessionSummary` fits). */
export interface RunningSession {
  readonly running: boolean
}

/** Every running session counts, subagents included: each one is an agent doing work. */
export function countRunning(sessions: readonly RunningSession[]): number {
  return sessions.filter(session => session.running).length
}

/** @returns "1 agent running" / "3 agents running", or null when nothing runs (the pill is then hidden). */
export function runningLabel(count: number): string | null {
  if (count <= 0) return null
  return `${String(count)} ${count === 1 ? 'agent' : 'agents'} running`
}
