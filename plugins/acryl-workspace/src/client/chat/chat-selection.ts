/**
 * Which chat is on screen, and which tab and worktree show it: the one owner of that relation.
 *
 * Two stores describe the shown chat: DSH's main view (the session its navigation holds, `uiWorkspace`) and ACRYL's tab sets (one per
 * worktree in each workspace, `WorkspaceGroups`). DSH's main view is the source of truth; the tab sets and the selected worktree follow it. The direction
 * is fixed by who may write what:
 *
 * - **User intents** (`open`, `selectTab`, `showWorktree`) are the only operations that ask DSH to show a chat.
 * - **Reconciling** (on a change of DSH's session list) only writes ACRYL's tab sets and the selected worktree. It never opens a chat, so
 *   no write it makes can come back as a navigation.
 *
 * Reconciling runs once the session list has settled (a microtask after the last change): DSH holds the next session before it releases
 * the previous one, and reading in between would see two sessions held as the main view.
 */

import type { ISessions, SessionListState } from '@acryl/ui/frame'
import { GLOBAL_GROUP, type WorkspaceGroups } from '../canvas/groups.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { currentSessionId, openMainSession, type MainViewNavigation } from '../sessions/main-session.ts'
import {
  chatGroupFor, ensureWorktreeChatTabs, sessionForSelectedChatTab, syncChatTabTitles, synchronizeWorkspaceWithSessionNavigation,
} from '../sessions/session-navigation.ts'

/** Opens a chat by id (the board's cards, the tree, the projects actions). */
export interface SessionNavigator {
  /** @returns false when the sessions service is not available yet. */
  open(sessionId: string): boolean
}

export interface ChatSelectionDeps {
  readonly groups: WorkspaceGroups
  readonly shell: WorkspaceShellState
  /** DSH's sessions service; absent until the chat is composed, and replaced when the engine is. */
  readonly getSessions: () => ISessions | undefined
  /** DSH's navigation (`uiWorkspace`); absent in a composition without it, in which case ACRYL holds the main view itself. */
  readonly getNavigation: () => MainViewNavigation | undefined
  /** Shows the workspace's tabs again when a page (Plugins, Automation tasks) covers them; a user's pick always returns to the tabs. */
  readonly showTabs?: () => void
  /** Defers reconciling until the session list has settled. Default: a microtask. */
  readonly schedule?: (run: () => void) => void
}

export class ChatSelection implements SessionNavigator {
  /** The chat the tab sets were last reconciled to, and the tab set its tab was placed in. */
  private shown: string | undefined
  private placedIn: string | undefined
  private scheduled = false
  private readonly seenTitles = new Map<string, string>()
  private readonly schedule: (run: () => void) => void

  constructor(private readonly deps: ChatSelectionDeps) {
    this.schedule = deps.schedule ?? (run => { queueMicrotask(run) })
  }

  /** Show a chat. Its tab and worktree follow when the session list reports the switch. */
  open(sessionId: string): boolean {
    const sessions = this.deps.getSessions()
    if (sessions === undefined) return false
    this.deps.showTabs?.()
    openMainSession(sessions, sessionId, this.deps.getNavigation())
    return true
  }

  /** The user selected a tab in a worktree's tab set: select it, and show its chat when it is a chat tab bound to one. */
  selectTab(worktree: string, tileId: string): void {
    this.deps.showTabs?.()
    const state = this.deps.groups.stateFor(worktree)
    state.selectTile(tileId)
    const tile = state.getSnapshot().tiles.find(candidate => candidate.id === tileId)
    const target = sessionForSelectedChatTab(tile, this.current())
    if (target !== undefined) this.open(target)
  }

  /**
   * The user selected a worktree (its name or its expander in the tree): select it and show its chat - the chat tab it had selected,
   * else whatever `otherwise` shows (its most recent chat, or a new one).
   */
  showWorktree(path: string, otherwise: () => void): void {
    // The tab the user had selected there, read before selecting the worktree adds its eager chat tabs.
    const before = this.deps.groups.stateFor(path).getSnapshot()
    const active = before.tiles.find(tile => tile.id === before.activeId)
    this.deps.showTabs?.()
    this.deps.shell.select(path)
    if (active?.kind === 'chat' && active.chatSessionId !== undefined) {
      const target = sessionForSelectedChatTab(active, this.current())
      if (target !== undefined) this.open(target)
      return
    }
    otherwise()
  }

  /** The chat on screen, from DSH's session list. */
  current(): string | undefined {
    const sessions = this.deps.getSessions()
    return sessions === undefined ? undefined : currentSessionId(sessions.list.getSnapshot())
  }

  /**
   * Keep the tab sets and the selected worktree following DSH's main view for as long as `sessions` is the sessions service.
   * @returns disposer.
   */
  watch(sessions: ISessions): () => void {
    const settle = (): void => {
      if (this.scheduled) return
      this.scheduled = true
      this.schedule(() => {
        this.scheduled = false
        this.reconcile(sessions.list.getSnapshot())
      })
    }
    const stopSessions = sessions.list.subscribe(settle)
    // A worktree selected, discovered or a chat dismissed changes which chats get eager tabs, and a worktree discovered after the shown
    // chat was placed can turn out to own it; neither moves the shown chat.
    const stopShell = this.deps.shell.subscribe(() => {
      const list = sessions.list.getSnapshot()
      this.relocateShown(list)
      this.ensureSelectedWorktreeTabs(list)
    })
    // Another workspace shown: its tab sets are other ones, so the shown chat's tab is placed again (spec 043, one tab set per workspace).
    let workspace = this.deps.groups.workspace()
    const stopGroups = this.deps.groups.onChange(() => {
      if (this.deps.groups.workspace() === workspace) return
      workspace = this.deps.groups.workspace()
      this.shown = undefined
      this.placedIn = undefined
      settle()
    })
    this.reconcile(sessions.list.getSnapshot())
    return () => { stopSessions(); stopShell(); stopGroups() }
  }

  private reconcile(list: SessionListState): void {
    const { shell, groups } = this.deps
    // Only the shown chat's folder is learned (through `follow`, below): learning every folder any chat ever ran in filled the tree with
    // folders the user never added and polled git in each of them.
    const current = currentSessionId(list)
    const row = current === undefined ? undefined : list.byId[current]
    if (current !== undefined) shell.restoreChat(current)
    if (current !== this.shown || current === undefined || row?.blank === true) {
      const selected = shell.getSnapshot().selectedPath ?? GLOBAL_GROUP
      const owner = current === undefined ? selected : chatGroupFor(shell.getSnapshot().repos, row?.cwd, selected)
      this.shown = synchronizeWorkspaceWithSessionNavigation(groups.stateFor(owner), this.shown, { current, blank: row?.blank })
      this.placedIn = owner
      if (row?.cwd !== undefined) void shell.follow(row.cwd)
    } else {
      this.relocateShown(list)
    }
    this.ensureSelectedWorktreeTabs(list)
    for (const [, state] of groups.entries()) syncChatTabTitles(state, list, this.seenTitles)
  }

  /**
   * Move the shown chat's tab to the worktree that owns it when that is known only now: at startup the chat is placed before the tree has
   * discovered its worktree, in the tab set on screen (none selected yet).
   */
  private relocateShown(list: SessionListState): void {
    const { shell, groups } = this.deps
    const id = this.shown
    const from = this.placedIn
    if (id === undefined || from === undefined) return
    const owner = chatGroupFor(shell.getSnapshot().repos, list.byId[id as keyof typeof list.byId]?.cwd, from)
    if (owner === from) return
    this.placedIn = owner
    const source = groups.stateFor(from)
    const tile = source.getSnapshot().tiles.find(candidate => candidate.kind === 'chat' && candidate.chatSessionId === id)
    if (tile !== undefined) source.closeTile(tile.id)
    groups.stateFor(owner).addTile('chat', { chatSessionId: id, ...(tile === undefined ? {} : { title: tile.title }) })
  }

  private ensureSelectedWorktreeTabs(list: SessionListState): void {
    const snapshot = this.deps.shell.getSnapshot()
    const selected = snapshot.selectedPath
    if (selected === undefined) return
    ensureWorktreeChatTabs(this.deps.groups.stateFor(selected), selected, snapshot.repos, { ids: list.ids, byId: list.byId, current: currentSessionId(list) }, snapshot.dismissedChats)
  }
}
