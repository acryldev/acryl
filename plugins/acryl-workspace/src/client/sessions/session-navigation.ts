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
}

/**
 * Keep DSH session navigation visible inside the Workspace tab area: the session that becomes current gets
 * its own chat tile (`addTile('chat', { chatSessionId })` finds-or-creates it by session id - spec 040
 * T130-followup, one AcrylDSH Chat tab per open session, not one shared tab for all of them).
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
 * Eagerly gives every non-blank chat session owned by this worktree its own tab, instead of only the one
 * that happens to be current - so a worktree with 6 sidebar chats shows 6 tabs immediately, not one at a
 * time as each is clicked. Each new tab's title is the session's real `displayTitle`, not the generic default.
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
  let added = false
  for (const id of sessions.ids) {
    if (existing.has(id) || dismissed.has(id)) continue
    const row = sessions.byId[id]
    // Blank chats too: the tree lists them ("New chat"), and every listed chat is a tab (owner: "still lazy
    // loading" - only the non-blank ones were, so a fresh chat sat in the list with no tab until clicked).
    if (row === undefined || row.cwd === undefined) continue
    if (owningWorktree(repos, row.cwd) !== worktreePath) continue
    workspace.addTile('chat', { chatSessionId: id, title: chatLabel(row) })
    added = true
  }
  if (!added) return
  const currentTile = sessions.current === undefined ? undefined : workspace.getSnapshot().tiles.find(tile => tile.kind === 'chat' && tile.chatSessionId === sessions.current)
  const restore = currentTile?.id ?? activeBefore
  if (restore !== undefined) workspace.selectTile(restore)
}

/**
 * Keep every open chat tab's title following its session's own title (owner request: rename in the left
 * tree or the tab strip, reflected in both). A tab's title is otherwise a static string set once at
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
