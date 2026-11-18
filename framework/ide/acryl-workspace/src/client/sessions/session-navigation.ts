import { WorkspaceState } from '../canvas/state.ts'
import { chatLabel, owningWorktree } from '../projects/sidebar-model.ts'
import type { RepoState } from '../worktrees/shell-state.ts'

/** What a chat tab is called until it is given a session's own name (`TITLES.chat` in canvas/state.ts). */
const GENERIC_CHAT_TITLE = 'AcrylDSH Chat'

export interface WorkspaceSessionNavigationProjection {
  readonly current: string | undefined
  readonly blank: boolean | undefined
}

/** The slice of a chat session `ensureWorktreeChatTabs` needs. */
export interface WorktreeChatSessionLike {
  readonly cwd?: string
  readonly blank: boolean
  readonly displayTitle: string
  readonly title?: string
  readonly updatedAt?: number
}

/** How many of a worktree's chats get a tab without being asked: the most recent ones. The tree lists every chat. */
export const RECENT_CHAT_TABS = 8

/**
 * Keep DSH session navigation visible inside the Workspace tab area: the session that becomes current gets
 * its own chat tile (`addTile('chat', { chatSessionId })` finds-or-creates it by session id: one AcrylDSH Chat tab per open session,
 * not one shared tab for all of them).
 * Re-selecting a blank session is the New Session signal even when its id is unchanged. Ordinary updates to
 * a non-blank current session leave the active Workspace tool tab alone.
 */
export function synchronizeWorkspaceWithSessionNavigation(
  workspace: WorkspaceState,
  previousCurrent: string | undefined,
  projection: WorkspaceSessionNavigationProjection,
): string | undefined {
  if (
    projection.current !== previousCurrent
    || projection.current === undefined
    || projection.blank === true
  ) {
    workspace.addTile('chat', projection.current === undefined ? {} : { chatSessionId: projection.current })
  }
  return projection.current
}

/**
 * The worktree whose tab set holds a session's chat tab: the worktree that owns the session's folder, else the one on screen (a
 * session outside every known worktree). A chat tab only ever lives in its owner's tab set. A tab in another worktree's set made
 * two reactions chase each other: selecting the tab opened its session, the tree followed that session to its owning worktree,
 * whose selected tab opened a session owned by the first worktree, and so on without end (a frozen window, 2026-10-12).
 */
export function chatGroupFor(repos: readonly RepoState[], cwd: string | undefined, shown: string): string {
  return (cwd === undefined ? undefined : owningWorktree(repos, cwd)) ?? shown
}

/**
 * The session to open because the user selected a chat tab: the tab's own session when it is not the one on screen. Every
 * chat tab shows the one main conversation, so selecting a tab without opening its session left the previous chat's conversation
 * under the new tab's name. A tab not bound to a session (none yet) opens nothing.
 */
export function sessionForSelectedChatTab(
  tile: { readonly kind: string; readonly chatSessionId?: string } | undefined,
  current: string | undefined,
): string | undefined {
  if (tile?.kind !== 'chat' || tile.chatSessionId === undefined) return undefined
  return tile.chatSessionId === current ? undefined : tile.chatSessionId
}

/**
 * Gives the worktree's most recent chats (`RECENT_CHAT_TABS`, by last update) their own tabs at once, instead of only the one that happens
 * to be current; older chats open from the tree. Every chat of a busy worktree as a tab grew without bound (95 tabs) and never shrank.
 * Each new tab's title is the session's real `displayTitle`, not the generic default.
 * Adding tabs never moves the selection: afterwards the shown chat's tab is selected when this worktree has
 * it, else the tab that was selected before (`addTile` focuses each tab it creates).
 */
export function ensureWorktreeChatTabs(
  workspace: WorkspaceState,
  worktreePath: string,
  repos: readonly RepoState[],
  sessions: { readonly ids: readonly string[]; readonly byId: Readonly<Record<string, WorktreeChatSessionLike | undefined>>; readonly current: string | undefined },
  dismissed: ReadonlySet<string> = new Set(),
): void {
  const existing = new Set(
    workspace.getSnapshot().tiles
      .filter(tile => tile.kind === 'chat' && tile.chatSessionId !== undefined)
      .map(tile => tile.chatSessionId),
  )
  const activeBefore = workspace.getSnapshot().activeId
  // An empty chat gets no tab of its own unless the user named it (the tree lists it as "New chat"; one never bound to a folder only asks
  // to choose one); the shown chat - a chat just started - always has its tab through the session sync.
  const recent = sessions.ids
    .flatMap((id) => {
      const row = sessions.byId[id]
      if (row === undefined || row.cwd === undefined || dismissed.has(id)) return []
      if (row.blank && (row.title === undefined || row.title.trim() === '')) return []
      return owningWorktree(repos, row.cwd) === worktreePath ? [{ id, row }] : []
    })
    .sort((a, b) => (b.row.updatedAt ?? 0) - (a.row.updatedAt ?? 0))
    .slice(0, RECENT_CHAT_TABS)
  let added = false
  for (const { id, row } of recent) {
    if (existing.has(id)) continue
    workspace.addTile('chat', { chatSessionId: id, title: chatLabel(row) })
    added = true
  }
  if (!added) return
  const currentTile = sessions.current === undefined ? undefined : workspace.getSnapshot().tiles.find(tile => tile.kind === 'chat' && tile.chatSessionId === sessions.current)
  const restore = currentTile?.id ?? activeBefore
  if (restore !== undefined) workspace.selectTile(restore)
}

/**
 * Keep every open chat tab's title following its session's own title (a rename in the left tree or the tab strip shows in both).
 * A tab's title is otherwise a static string set once at
 * creation. Only a *change* in the session's label since the last time this ran is applied
 * (`seen` remembers it per session): re-applying an unchanged title would revert a name the user just
 * typed into a tab before the Host round trip has come back with it.
 * @param seen - session id -> the displayTitle last applied; owned by the caller so it survives re-runs.
 */
export function syncChatTabTitles(
  workspace: WorkspaceState,
  sessions: { readonly byId: Readonly<Record<string, Pick<WorktreeChatSessionLike, 'blank' | 'displayTitle' | 'title'> | undefined>> },
  seen: Map<string, string>,
): void {
  for (const tile of workspace.getSnapshot().tiles) {
    if (tile.kind !== 'chat' || tile.chatSessionId === undefined) continue
    const row = sessions.byId[tile.chatSessionId]
    if (row === undefined) continue
    const label = chatLabel(row)
    const previous = seen.get(tile.chatSessionId)
    seen.set(tile.chatSessionId, label)
    // First sight also replaces the generic default ("AcrylDSH Chat", what a tab opened by the session
    // sync starts with) so the tab and the tree row say the same thing from the start.
    const changed = previous === undefined ? tile.title === GENERIC_CHAT_TITLE : previous !== label
    if (changed && tile.title !== label) workspace.renameTile(tile.id, label)
  }
}
