/**
 * The open terminals a comment can be sent into: the terminal and agent tabs of the shown workspace's worktrees, and the terminal panel's
 * tabs, each named as the user sees it. Only terminals whose process is running are offered.
 */

import { GLOBAL_GROUP, type WorkspaceGroups } from '../canvas/groups.ts'
import type { DockGroups } from '../dock/dock-tabs.ts'
import type { TerminalSession } from '../terminal/terminal-session.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export interface TerminalTarget {
  readonly terminalId: string
  /** The tab's name, as its tab shows it. */
  readonly title: string
  /** The worktree the tab belongs to. */
  readonly worktree: string
  /** Its branch, or the folder's name, for the menu. */
  readonly worktreeLabel: string
  /** A canvas tab (agents and terminals opened from +) or a tab of the terminal panel. */
  readonly place: 'tab' | 'panel'
  /** The canvas tab's id, to bring it to the front. */
  readonly tabId?: string
  /** An agent (Claude Code, Codex, ...) rather than a plain shell. */
  readonly agent: boolean
}

export interface TerminalTargetDeps {
  readonly groups: Pick<WorkspaceGroups, 'keys' | 'stateFor'>
  readonly dock: { readonly groups: Pick<DockGroups, 'keys' | 'stateFor'> }
  readonly terminals: { readonly get: (terminalId: string) => Pick<TerminalSession, 'isLive'> | undefined }
  readonly shell: Pick<WorkspaceShellState, 'getSnapshot'>
}

function labelOf(shell: TerminalTargetDeps['shell'], worktree: string): string {
  if (worktree === GLOBAL_GROUP) return 'no worktree'
  for (const repo of shell.getSnapshot().repos) {
    const found = repo.worktrees.find(candidate => candidate.path === worktree)
    if (found !== undefined) return found.branch ?? repo.name
  }
  return worktree.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() ?? worktree
}

/** @param first - the worktree whose terminals come first (the one the comments are from). */
export function listTerminalTargets(deps: TerminalTargetDeps, first?: string): TerminalTarget[] {
  const live = (terminalId: string): boolean => deps.terminals.get(terminalId)?.isLive() === true
  const targets: TerminalTarget[] = []
  for (const worktree of deps.groups.keys()) {
    for (const tile of deps.groups.stateFor(worktree).getSnapshot().tiles) {
      if (tile.kind !== 'pty' || tile.terminalId === undefined || !live(tile.terminalId)) continue
      targets.push({ terminalId: tile.terminalId, title: tile.title, worktree, worktreeLabel: labelOf(deps.shell, worktree), place: 'tab', tabId: tile.id, agent: tile.commandId !== undefined && tile.commandId !== 'shell' })
    }
  }
  for (const worktree of deps.dock.groups.keys()) {
    for (const tab of deps.dock.groups.stateFor(worktree).getSnapshot().tabs) {
      if (tab.terminalId === undefined || !live(tab.terminalId)) continue
      targets.push({ terminalId: tab.terminalId, title: tab.title, worktree, worktreeLabel: labelOf(deps.shell, worktree), place: 'panel', agent: false })
    }
  }
  // This worktree's first, agents before plain shells; otherwise as the tabs are ordered.
  const rank = (target: TerminalTarget): number => (target.worktree === first ? 0 : 2) + (target.agent ? 0 : 1)
  return targets.map((target, index) => ({ target, index })).sort((a, b) => rank(a.target) - rank(b.target) || a.index - b.index).map(entry => entry.target)
}
