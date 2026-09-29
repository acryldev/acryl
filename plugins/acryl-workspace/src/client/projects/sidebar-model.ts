/** Pure view-model for the Projects list in the left pane. */

import type { WorktreeAttention } from '../status/attention-model.ts'
import type { RepoState, ShellSnapshot, WorktreeState } from '../worktrees/shell-state.ts'

/** The slice of a session row the model needs. */
export interface SessionLike {
  readonly cwd?: string
  readonly running: boolean
  readonly completed?: boolean
  readonly blank: boolean
}

/** What a worktree's status dot means, most urgent first. */
export type WorktreeDot = 'error' | 'attention' | 'running' | 'done' | 'loading' | 'dirty' | 'clean'

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

/** The slice of a canvas tile the tree needs to list a worktree's running agents/terminals (spec 040 T129). */
export interface AgentTileLike {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly commandId?: string
}

/** The slice of a chat session the tree needs to list a worktree's AcrylDSH Chats (spec 040 T129/T130). */
export interface ChatSessionLike {
  readonly id: string
  readonly cwd?: string
  readonly blank: boolean
  readonly running: boolean
  /** SessionSummary's own resolved label (durable title, then project basename, then session id) - never guess a title here. */
  readonly displayTitle: string
}

/**
 * One row under an expanded worktree: a running agent/terminal tab, or an AcrylDSH Chat scoped to it.
 * Deliberately never a file, browser, diff, board or doc tab - the tree lists live sessions only.
 */
export interface WorktreeSessionEntry {
  readonly kind: 'agent' | 'chat'
  readonly id: string
  readonly label: string
  /** Set for kind 'agent': which runtime, for its icon ('shell' for a plain terminal). */
  readonly commandId?: string
  readonly running?: boolean
}

/**
 * Everything to list under one expanded worktree: its open agent/terminal tabs (any `pty` canvas tile - a
 * named agent or a plain shell) and its AcrylDSH Chat sessions (by cwd). Never file/browser/diff/board/doc
 * tiles - those stay reachable from their own tab strip, not duplicated into this tree (spec 040 T129).
 */
export function entriesForWorktree(path: string, repos: readonly RepoState[], tiles: readonly AgentTileLike[], chats: readonly ChatSessionLike[]): WorktreeSessionEntry[] {
  const agents: WorktreeSessionEntry[] = tiles
    .filter(tile => tile.kind === 'pty')
    .map(tile => ({ kind: 'agent', id: tile.id, label: tile.title, commandId: tile.commandId ?? 'shell' }))
  // owningWorktree (deepest match), not a plain isInside: a linked worktree nested under this one claims
  // its own chats, and they must not also appear here.
  const ownChats: WorktreeSessionEntry[] = chats
    .filter(chat => chat.cwd !== undefined && owningWorktree(repos, chat.cwd) === path)
    .map(chat => ({ kind: 'chat', id: chat.id, label: chat.blank ? 'New chat' : chat.displayTitle, running: chat.running }))
  return [...agents, ...ownChats]
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

function dotFor(worktree: WorktreeState, running: number, done: number, waiting: number): WorktreeDot {
  if (worktree.phase === 'error') return 'error'
  // An agent that needs you outranks everything else: it is the one thing that cannot wait.
  if (waiting > 0) return 'attention'
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
  attention: ReadonlyMap<string, WorktreeAttention> = new Map(),
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
      const terminalAgents = attention.get(worktree.path) ?? { waiting: 0, working: 0 }
      return {
        path: worktree.path,
        label: worktree.branch ?? `${basename(worktree.path)} (detached)`,
        main: worktree.main,
        dot: dotFor(worktree, counts.running + terminalAgents.working, counts.done, terminalAgents.waiting),
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
