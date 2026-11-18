/** Which agents are open in which worktree, for the icons next to each branch in the Projects list. */

/** The slice of a tab this needs. */
export interface AgentTab {
  readonly kind: string
  readonly commandId?: string | undefined
}

/** How many agent icons a worktree row shows before it says "+N". */
export const MAX_ROW_AGENTS = 4

/**
 * @param tabsByWorktree - the open tabs of each worktree, by worktree path.
 * @returns for each worktree, the distinct agents (not plain terminals) open in it, in tab order.
 */
export function agentsByWorktree(tabsByWorktree: ReadonlyMap<string, readonly AgentTab[]>): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>()
  for (const [path, tabs] of tabsByWorktree) {
    const ids: string[] = []
    for (const tab of tabs) {
      if (tab.kind === 'pty' && tab.commandId !== undefined && tab.commandId !== 'shell' && !ids.includes(tab.commandId)) ids.push(tab.commandId)
    }
    if (ids.length > 0) result.set(path, ids)
  }
  return result
}
