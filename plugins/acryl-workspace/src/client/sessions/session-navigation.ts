import { WorkspaceState } from '../canvas/state.ts'
import { owningWorktree } from '../projects/sidebar-model.ts'
import type { RepoState } from '../worktrees/shell-state.ts'

export interface WorkspaceSessionNavigationProjection {
  readonly current: string | undefined
  readonly blank: boolean | undefined
}

/** The slice of a chat session `ensureWorktreeChatTabs` needs. */
export interface WorktreeChatSessionLike {
  readonly cwd?: string
  readonly blank: boolean
  readonly displayTitle: string
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
 * Eagerly gives every non-blank chat session owned by this worktree its own tab, instead of only the one
 * that happens to be current - so a worktree with 6 sidebar chats shows 6 tabs immediately, not one at a
 * time as each is clicked (owner feedback: "they are not loaded into the tab strip immediately"). Each new
 * tab's title is the session's real `displayTitle`, not the generic default. Restores whichever tab was
 * already active afterward, since `addTile` focuses each one as it creates it.
 */
export function ensureWorktreeChatTabs(
  workspace: WorkspaceState,
  worktreePath: string,
  repos: readonly RepoState[],
  sessions: { readonly ids: readonly string[]; readonly byId: Readonly<Record<string, WorktreeChatSessionLike | undefined>>; readonly current: string | undefined },
): void {
  const existing = new Set(
    workspace.getSnapshot().tiles
      .filter(tile => tile.kind === 'chat' && tile.chatSessionId !== undefined)
      .map(tile => tile.chatSessionId),
  )
  let added = false
  for (const id of sessions.ids) {
    if (existing.has(id)) continue
    const row = sessions.byId[id]
    if (row === undefined || row.blank || row.cwd === undefined) continue
    if (owningWorktree(repos, row.cwd) !== worktreePath) continue
    workspace.addTile('chat', { chatSessionId: id, title: row.displayTitle })
    added = true
  }
  if (added && sessions.current !== undefined) {
    const currentTile = workspace.getSnapshot().tiles.find(tile => tile.kind === 'chat' && tile.chatSessionId === sessions.current)
    if (currentTile !== undefined) workspace.selectTile(currentTile.id)
  }
}
