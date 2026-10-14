/** Pure view-model for the Projects list in the left pane. */

import type { WorktreeAttention } from '../status/attention-model.ts'
import type { RepoState, ShellSnapshot, WorktreeState } from '../worktrees/shell-state.ts'

/** The slice of a session row the model needs. */
export interface SessionLike {
  readonly id?: string
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
  /** Open chats here: running, or with a tab in this worktree (the ones its list shows; earlier chats are not counted). */
  readonly sessions: number
  readonly selected: boolean
  /** Agents (not plain terminals) open in this worktree's tabs, for the icons on the row. */
  readonly agents: readonly string[]
}

export interface RepoRow {
  readonly root: string
  readonly name: string
  /** false for a plain folder workspace that is not a git repository - no branches, no
   * "New branch" affordance, a distinct icon instead of the git one. */
  readonly git: boolean
  readonly rows: readonly WorktreeRow[]
}

/** The slice of a canvas tile the tree needs to list a worktree's running agents/terminals (spec 040 T129). */
export interface AgentTileLike {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly commandId?: string
  /** Set on a chat tile: the session it shows. */
  readonly chatSessionId?: string
}

/** The slice of a chat session the tree needs to list a worktree's AcrylDSH Chats (spec 040 T129/T130). */
export interface ChatSessionLike {
  readonly id: string
  readonly cwd?: string
  readonly blank: boolean
  readonly running: boolean
  /** SessionSummary's own resolved label (durable title, then project basename, then session id) - never guess a title here. */
  readonly displayTitle: string
  /** The session's own durable title, when the Host has projected one (absent until renamed or titled). */
  readonly title?: string
}

/**
 * The one label a chat goes by, in the tree and on its tab alike: its own durable title first (so a
 * rename shows even on a chat with no messages yet - a blank chat used to say "New chat" no matter what
 * it was named), else "New chat" while blank, else the resolved display title.
 */
export function chatLabel(chat: { readonly blank: boolean; readonly displayTitle: string; readonly title?: string }): string {
  if (chat.title !== undefined && chat.title.trim() !== '') return chat.title
  return chat.blank ? 'New chat' : chat.displayTitle
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
  /** Whether this entry is the tab strip's selected tile right now, so the selected tab's row is highlighted. */
  readonly active?: boolean
  /** A chat that is neither open in a tab nor running: history, listed only under "earlier chats". */
  readonly earlier?: boolean
}

/** The worktree's currently active canvas tile, only as much as entry-highlighting needs. */
export interface ActiveTileLike {
  readonly id: string
  readonly chatSessionId?: string
}

/**
 * Everything to list under one expanded worktree: its open agent/terminal tabs (any `pty` canvas tile - a
 * named agent or a plain shell) and its AcrylDSH Chat sessions (by cwd). Never file/browser/diff/board/doc
 * tiles - those stay reachable from their own tab strip, not duplicated into this tree (spec 040 T129).
 * @param active - the worktree's active tile, so its row can be highlighted here to match
 * the tab strip; undefined when nothing is active or the active tile is not a kind this list shows.
 */
export function entriesForWorktree(
  path: string,
  repos: readonly RepoState[],
  tiles: readonly AgentTileLike[],
  chats: readonly ChatSessionLike[],
  active?: ActiveTileLike,
): WorktreeSessionEntry[] {
  const agents: WorktreeSessionEntry[] = tiles
    .filter(tile => tile.kind === 'pty')
    .map(tile => ({ kind: 'agent', id: tile.id, label: tile.title, commandId: tile.commandId ?? 'shell', active: tile.id === active?.id }))
  // owningWorktree (deepest match), not a plain isInside: a linked worktree nested under this one claims
  // its own chats, and they must not also appear here.
  // Every chat that ever ran in the folder is listed, but only the open ones (a tab here, running, or selected) up front: a CLI or TUI start
  // leaves a session behind, so a busy folder collects dozens, and listing them all read as dozens of open chats nobody closed.
  const openTabs = new Set(tiles.flatMap(tile => tile.kind === 'chat' && tile.chatSessionId !== undefined ? [tile.chatSessionId] : []))
  const ownChats: WorktreeSessionEntry[] = chats
    .filter(chat => chat.cwd !== undefined && owningWorktree(repos, chat.cwd) === path)
    .map((chat) => {
      const selected = chat.id === active?.chatSessionId
      const open = openTabs.has(chat.id) || chat.running || selected
      return { kind: 'chat' as const, id: chat.id, label: chatLabel(chat), running: chat.running, active: selected, ...(open ? {} : { earlier: true }) }
    })
  return [...agents, ...ownChats.filter(entry => entry.earlier !== true), ...ownChats.filter(entry => entry.earlier === true)]
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

function isInside(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/**
 * The tree's repositories a workspace shows (spec 043): for each of its project folders, the repository that owns it - the one with the
 * deepest root or worktree containing it, so a plain folder that merely contains the project (a parent like ~/projects) is not pulled in -
 * and the repository of the worktree on screen (`selected`), so the shown chat's folder is never missing. Nothing else: a folder some chat
 * once ran in is not a project.
 */
export function reposInWorkspace(repos: readonly RepoRow[], projects: readonly string[], selected?: string): readonly RepoRow[] {
  const owners = new Set<RepoRow>()
  for (const project of [...projects, ...(selected === undefined ? [] : [selected])]) {
    let best: { repo: RepoRow, depth: number } | undefined
    for (const repo of repos) {
      for (const place of [repo.root, ...repo.rows.map(row => row.path)]) {
        if (isInside(project, place) && (best === undefined || place.length > best.depth)) best = { repo, depth: place.length }
      }
    }
    if (best !== undefined) owners.add(best.repo)
  }
  return repos.filter(repo => owners.has(repo))
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
 * @param openChats - per worktree, the chat sessions with a tab there; with `running`, what the row's chat count counts.
 * @returns one entry per repository, worktrees in git order.
 */
export function buildProjectRows(
  snapshot: ShellSnapshot,
  sessions: readonly SessionLike[],
  agentsByPath: ReadonlyMap<string, readonly string[]> = new Map(),
  attention: ReadonlyMap<string, WorktreeAttention> = new Map(),
  openChats: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): RepoRow[] {
  const perWorktree = new Map<string, { sessions: number; running: number; done: number }>()
  for (const session of sessions) {
    if (session.blank || session.cwd === undefined) continue
    const owner = owningWorktree(snapshot.repos, session.cwd)
    if (owner === undefined) continue
    const entry = perWorktree.get(owner) ?? { sessions: 0, running: 0, done: 0 }
    if (session.running || (session.id !== undefined && openChats.get(owner)?.has(session.id) === true)) entry.sessions += 1
    if (session.running) entry.running += 1
    if (session.completed === true) entry.done += 1
    perWorktree.set(owner, entry)
  }
  return snapshot.repos.map(repo => ({
    root: repo.root,
    name: repo.name,
    git: repo.git,
    rows: repo.worktrees.map((worktree) => {
      const counts = perWorktree.get(worktree.path) ?? { sessions: 0, running: 0, done: 0 }
      const terminalAgents = attention.get(worktree.path) ?? { waiting: 0, working: 0 }
      return {
        path: worktree.path,
        // A plain folder's one synthetic worktree has no branch at all - "(detached)" only makes sense
        // for a real git worktree with no checked-out branch, never for a non-git folder.
        label: worktree.branch ?? (repo.git ? `${basename(worktree.path)} (detached)` : basename(worktree.path)),
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
