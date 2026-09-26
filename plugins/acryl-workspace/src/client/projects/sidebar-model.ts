/** Pure view-model for the Projects list in the left pane. */

import type { RepoState, ShellSnapshot, WorktreeState } from '../worktrees/shell-state.ts'

/** The slice of a session row the model needs. */
export interface SessionLike {
  readonly cwd?: string
  readonly running: boolean
  readonly completed?: boolean
  readonly blank: boolean
}

/** What a worktree's status dot means, most urgent first. */
export type WorktreeDot = 'error' | 'running' | 'done' | 'loading' | 'dirty' | 'clean'

export interface WorktreeRow {
  readonly path: string
  readonly label: string
  readonly main: boolean
  readonly dot: WorktreeDot
  readonly changeCount: number
  readonly added: number
  readonly removed: number
  /** Chat sessions whose working directory is inside this worktree. */
  readonly sessions: number
  readonly selected: boolean
  /** Agents (not plain terminals) open in this worktree's tabs, for the icons on the row. */
  readonly agents: readonly string[]
}

export interface RepoRow {
  readonly root: string
  readonly name: string
  readonly rows: readonly WorktreeRow[]
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

function isInside(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/**
 * The worktree that owns a session directory: the deepest worktree path containing it, so a
 * linked worktree nested under the main checkout still claims its own sessions.
 */
export function owningWorktree(repos: readonly RepoState[], cwd: string): string | undefined {
  let best: string | undefined
  for (const repo of repos) {
    for (const worktree of repo.worktrees) {
      if (isInside(cwd, worktree.path) && (best === undefined || worktree.path.length > best.length)) {
        best = worktree.path
      }
    }
  }
  return best
}

function dotFor(worktree: WorktreeState, running: number, done: number): WorktreeDot {
  if (worktree.phase === 'error') return 'error'
  if (running > 0) return 'running'
  if (done > 0) return 'done'
  if (worktree.phase === 'idle' || worktree.phase === 'loading') return 'loading'
  return worktree.changes.length > 0 ? 'dirty' : 'clean'
}

/**
 * @param snapshot - shell state.
 * @param sessions - chat sessions; blank ones are ignored.
 * @returns one entry per repository, worktrees in git order.
 */
export function buildProjectRows(
  snapshot: ShellSnapshot,
  sessions: readonly SessionLike[],
  agentsByPath: ReadonlyMap<string, readonly string[]> = new Map(),
): RepoRow[] {
  const perWorktree = new Map<string, { sessions: number; running: number; done: number }>()
  for (const session of sessions) {
    if (session.blank || session.cwd === undefined) continue
    const owner = owningWorktree(snapshot.repos, session.cwd)
    if (owner === undefined) continue
    const entry = perWorktree.get(owner) ?? { sessions: 0, running: 0, done: 0 }
    entry.sessions += 1
    if (session.running) entry.running += 1
    if (session.completed === true) entry.done += 1
    perWorktree.set(owner, entry)
  }
  return snapshot.repos.map(repo => ({
    root: repo.root,
    name: repo.name,
    rows: repo.worktrees.map((worktree) => {
      const counts = perWorktree.get(worktree.path) ?? { sessions: 0, running: 0, done: 0 }
      return {
        path: worktree.path,
        label: worktree.branch ?? `${basename(worktree.path)} (detached)`,
        main: worktree.main,
        dot: dotFor(worktree, counts.running, counts.done),
        changeCount: worktree.changes.length,
        added: worktree.added,
        removed: worktree.removed,
        sessions: counts.sessions,
        selected: snapshot.selectedPath === worktree.path,
        agents: agentsByPath.get(worktree.path) ?? [],
      }
    }),
  }))
}
