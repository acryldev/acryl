/** Turning per-terminal agent states into what each worktree row and tab shows. Pure. */

import type { AgentState } from '../../agents/status/agent-status.ts'

/** The slice of a tab this needs. */
export interface AttentionTab {
  readonly kind: string
  readonly commandId?: string | undefined
  readonly terminalId?: string | undefined
}

export interface WorktreeAttention {
  /** Agents that need you (a permission, a question). */
  readonly waiting: number
  /** Agents that are busy. */
  readonly working: number
}

/**
 * @param tabsByWorktree - the open tabs of each worktree, by worktree path.
 * @param states - what each terminal agent last reported.
 * @returns for each worktree with an agent that is working or waiting, how many of each. Plain shells never count.
 */
export function attentionByWorktree(
  tabsByWorktree: ReadonlyMap<string, readonly AttentionTab[]>,
  states: ReadonlyMap<string, AgentState>,
): ReadonlyMap<string, WorktreeAttention> {
  const result = new Map<string, WorktreeAttention>()
  for (const [path, tabs] of tabsByWorktree) {
    let waiting = 0
    let working = 0
    for (const tab of tabs) {
      if (tab.kind !== 'pty' || tab.commandId === undefined || tab.commandId === 'shell' || tab.terminalId === undefined) continue
      const state = states.get(tab.terminalId)
      if (state === 'waiting') waiting += 1
      else if (state === 'working') working += 1
    }
    if (waiting > 0 || working > 0) result.set(path, { waiting, working })
  }
  return result
}
