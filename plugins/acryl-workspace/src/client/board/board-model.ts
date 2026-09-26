/** Pure model of the live session board: chats grouped by what their agent is doing right now. */

import type { RepoState } from '../worktrees/shell-state.ts'
import { owningWorktree } from '../projects/sidebar-model.ts'

/** The slice of a session row the board needs (a `SessionSummary` fits). */
export interface BoardSession {
  readonly id: string
  readonly cwd?: string
  readonly running: boolean
  readonly blank: boolean
  readonly updatedAt: number
  readonly origin?: string
}

export type BoardColumnId = 'ready' | 'running' | 'done'

export interface BoardCard {
  readonly sessionId: string
  /** The branch (or worktree folder) the chat works in, or null when its folder is in no known worktree. */
  readonly branch: string | null
  readonly cwd: string | undefined
  readonly updatedAt: number
}

export interface BoardColumn {
  readonly id: BoardColumnId
  readonly label: string
  readonly cards: readonly BoardCard[]
}

/** How many finished chats the Done column lists; older ones stay reachable from the chat list. */
export const DONE_LIMIT = 30

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

function branchOf(repos: readonly RepoState[], cwd: string | undefined): string | null {
  if (cwd === undefined) return null
  const owner = owningWorktree(repos, cwd)
  if (owner === undefined) return null
  for (const repo of repos) {
    const worktree = repo.worktrees.find(candidate => candidate.path === owner)
    if (worktree !== undefined) return worktree.branch ?? `${basename(worktree.path)} (detached)`
  }
  return null
}

/**
 * @param sessions - every session row; subagent rows are left out (they belong to their parent chat).
 * @param repos - the discovered repositories, to name each chat's branch.
 * @returns Ready (blank chats), Running, and Done (finished chats, newest first, capped), in that order.
 */
export function buildSessionBoard(sessions: readonly BoardSession[], repos: readonly RepoState[]): BoardColumn[] {
  const cards = { ready: [] as BoardCard[], running: [] as BoardCard[], done: [] as BoardCard[] }
  for (const session of sessions) {
    if (session.origin === 'subagent') continue
    const card: BoardCard = {
      sessionId: session.id,
      branch: branchOf(repos, session.cwd),
      cwd: session.cwd,
      updatedAt: session.updatedAt,
    }
    if (session.blank) cards.ready.push(card)
    else if (session.running) cards.running.push(card)
    else cards.done.push(card)
  }
  const newest = (a: BoardCard, b: BoardCard): number => b.updatedAt - a.updatedAt
  return [
    { id: 'ready', label: 'Ready', cards: cards.ready.sort(newest) },
    { id: 'running', label: 'Running', cards: cards.running.sort(newest) },
    { id: 'done', label: 'Done', cards: cards.done.sort(newest).slice(0, DONE_LIMIT) },
  ]
}
