/** What the slim status line under the workspace says: the branch, its changes, and who is working. */

export interface StatusLineInput {
  /** The selected worktree's branch (null when detached), or undefined when no worktree is selected. */
  readonly branch: string | null | undefined
  readonly changedFiles: number
  readonly added: number
  readonly removed: number
  /** Agents (chat sessions and subagents) working right now. */
  readonly runningAgents: number
  /** Terminal and agent tabs open in the selected worktree. */
  readonly terminals: number
}

export interface StatusSegment {
  readonly id: 'branch' | 'changes' | 'running' | 'terminals'
  readonly text: string
  readonly title: string
}

const plural = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`

/** @returns the segments to show, in order; a segment with nothing to say is left out. */
export function buildStatusLine(input: StatusLineInput): StatusSegment[] {
  const segments: StatusSegment[] = []
  if (input.branch !== undefined) {
    segments.push({ id: 'branch', text: input.branch ?? 'detached', title: 'The branch of the selected worktree' })
  }
  if (input.changedFiles > 0) {
    const lines = input.added + input.removed > 0 ? ` +${String(input.added)} -${String(input.removed)}` : ''
    segments.push({ id: 'changes', text: `${plural(input.changedFiles, 'file', 'files')} changed${lines}`, title: 'Uncommitted changes in this worktree' })
  }
  if (input.runningAgents > 0) {
    segments.push({ id: 'running', text: plural(input.runningAgents, 'agent', 'agents') + ' running', title: 'Agents working right now' })
  }
  if (input.terminals > 0) {
    segments.push({ id: 'terminals', text: plural(input.terminals, 'terminal', 'terminals'), title: 'Terminal and agent tabs in this worktree' })
  }
  return segments
}
