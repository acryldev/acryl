/** Left pane: one workspace-first tree (spec 040 T128-130) - no Chats | Projects mode switch. Each repo and
 * each of its branches/worktrees collapses independently; an expanded worktree lists its running agent/
 * terminal tabs and its AcrylDSH Chat sessions, never a file/browser/diff/board/doc tab. The upstream
 * sidebar (search, and anything else it owns) stays reachable behind a Search toggle instead of a mode. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { CustomAgent } from '../../agents/definition.ts'
import { AcrylMarkIcon, ChatIcon, ChevronIcon, CollapseSidebarIcon, FolderIcon, GitRepoIcon } from '../agents/controls.tsx'
import type { AgentsState } from '../agents/agents-state.ts'
import type { WorkspaceGroups } from '../canvas/groups.ts'
import { agentsByWorktree, MAX_ROW_AGENTS } from '../chrome/worktree-agents.ts'
import { AgentIcon } from '../tabs/AgentIcon.tsx'
import type { ProjectsControl } from './projects-control.ts'
import { attentionByWorktree, type WorktreeAttention } from '../status/attention-model.ts'
import type { AgentStatusState } from '../status/agent-status-state.ts'
import { buildProjectRows, entriesForWorktree, type RepoRow, type WorktreeDot, type WorktreeRow, type WorktreeSessionEntry } from './sidebar-model.ts'
import type { DesktopSidebarSurfaceOwnerProps } from '../shell/contracts.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

/** The left-pane owner interface the frame offers: the same one the frame's default sidebar receives. */
export type ProjectsSidebarOwnerProps = DesktopSidebarSurfaceOwnerProps

export type ProjectsSidebarProps = Omit<PropsRuntime<'root'>, 'useSessions'> & ProjectsSidebarOwnerProps & {
  readonly useSessions: UseSessions
  readonly shell: WorkspaceShellState
  readonly projects: ProjectsControl
  /** The tab groups, to show which agents are open in each worktree. */
  readonly groups: WorkspaceGroups
  /** The user's custom agents, for their badges. */
  readonly agents: AgentsState
  /** What each terminal agent reports it is doing, for the "needs you" dot. */
  readonly status: AgentStatusState
}

const DOT_LABEL: Record<WorktreeDot, string> = {
  error: 'Status unavailable',
  attention: 'An agent needs you',
  running: 'Agent running',
  done: 'Agent finished, not yet opened',
  loading: 'Loading',
  dirty: 'Uncommitted changes',
  clean: 'Clean',
}

/**
 * The advanced shell's left pane: one workspace-first tree (spec 040 T128-130), nesting workspace ->
 * branch/worktree, each independently collapsible. An expanded worktree lists its running agent/terminal
 * tabs and its AcrylDSH Chat sessions - never a file, browser, diff, board or doc tab, so the tree cannot
 * be polluted the way a flat "everything open" list would be. The upstream sidebar (its search, and
 * anything else it owns) is kept mounted but hidden by default, reachable behind a Search toggle.
 */
export function ProjectsSidebar({ collapsed, renderUpstream, onToggleCollapse, useSessions, shell, projects, groups, agents, status }: ProjectsSidebarProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const sessions = useSessions(state => state)
  const workspaceKey = useSyncExternalStore(projects.subscribeWorkspaces, () => projects.workspaceKey())
  const [notice, setNotice] = useState<string | null>(null)
  /** A neutral hint (not an error), for actions that continue in another part of the UI. */
  const [hint, setHint] = useState<string | null>(null)
  /** The repository whose "new branch" form is open. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  /** The "add by path" form (Web has no native folder chooser). */
  const [addingByPath, setAddingByPath] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [addingBusy, setAddingBusy] = useState(false)
  /** Repos collapsed by the user; a repo not in here starts expanded. */
  const [collapsedRepos, setCollapsedRepos] = useState<ReadonlySet<string>>(() => new Set())
  /** Worktrees expanded to show their running sessions; a worktree not in here starts collapsed. */
  const [expandedWorktrees, setExpandedWorktrees] = useState<ReadonlySet<string>>(() => new Set())
  /** The upstream sidebar (search and anything else it owns), off by default now that it is not a mode. */
  const [searchOpen, setSearchOpen] = useState(false)

  // Registered workspace folders are projects even before they have a chat. registerFolder: true - these
  // came from an explicit "add this folder" action (T135), unlike the passive per-session discovery
  // just below, which must never promote an untouched session directory to a permanent workspace entry.
  useEffect(() => {
    for (const path of projects.workspacePaths()) void shell.discover(path, { registerFolder: true })
  }, [shell, projects, workspaceKey])

  useEffect(() => {
    for (const id of sessions.ids) {
      const cwd = sessions.byId[id]?.cwd
      if (cwd !== undefined) void shell.discover(cwd)
    }
    const currentCwd = sessions.current === undefined ? undefined : sessions.byId[sessions.current]?.cwd
    if (currentCwd !== undefined) void shell.follow(currentCwd)
  }, [shell, sessions])

  // The agents open per worktree, kept as a stable text key so unrelated tab changes do not re-render the list.
  const agentsKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify([...agentsByWorktree(new Map(groups.keys().map(key => [key, groups.stateFor(key).getSnapshot().tiles] as const)))]),
  )
  // Every pty tile (named agent or plain terminal), for the expanded-worktree session list - broader than
  // agentsKey above, which deliberately drops plain terminals since it only feeds the row icons. Also
  // each worktree's activeId (T139-followup: clicking a tab in the strip must highlight its row here too),
  // so this recomputes on every tab-strip focus change, not only when a tile is added or removed.
  const tilesKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify(groups.keys().map((key) => {
      const state = groups.stateFor(key).getSnapshot()
      return [key, state.activeId, state.tiles.filter(tile => tile.kind === 'pty').map(tile => [tile.id, tile.title, tile.commandId])]
    })),
  )
  // Which worktrees have an agent that needs you or is busy, as a stable text key for the same reason.
  const attentionKey = useSyncExternalStore(
    useCallback((listener: () => void) => {
      const stopGroups = groups.onChange(listener)
      const stopStatus = status.subscribe(listener)
      return () => { stopGroups(); stopStatus() }
    }, [groups, status]),
    () => JSON.stringify([...attentionByWorktree(new Map(groups.keys().map(key => [key, groups.stateFor(key).getSnapshot().tiles] as const)), status.getSnapshot())]),
  )
  const customAgents = useSyncExternalStore(agents.subscribe, agents.getSnapshot)
  const chatRows = useMemo(
    () => sessions.ids.flatMap((id) => {
      if (snapshot.dismissedChats.has(id)) return [] // T134-followup: hidden from tree, dot count and tab strip alike
      const row = sessions.byId[id]
      return row === undefined ? [] : [{ id, blank: row.blank, running: row.running, displayTitle: row.displayTitle, ...(row.cwd === undefined ? {} : { cwd: row.cwd }) }]
    }),
    [sessions, snapshot.dismissedChats],
  )
  const repos = useMemo(
    () => buildProjectRows(snapshot, chatRows, new Map(JSON.parse(agentsKey) as Array<[string, string[]]>), new Map(JSON.parse(attentionKey) as Array<[string, WorktreeAttention]>)),
    [snapshot, chatRows, agentsKey, attentionKey],
  )

  const toggleRepo = (root: string): void => {
    setCollapsedRepos((current) => {
      const next = new Set(current)
      if (next.has(root)) next.delete(root); else next.add(root)
      return next
    })
  }

  const toggleWorktree = (path: string): void => {
    // Expanding a worktree's session list also selects it (T137/T138-followup: "all of the agent
    // sessions and terminals should be opened in the Tab Stripe" when a workspace is opened) - the tree's
    // own list and the tab strip both already reflect the same already-restored WorkspaceGroups state
    // the instant `groups.stateFor(path)` is called (WorkspaceState.restore() loads every saved tile at
    // once, not one at a time), so the real gap was never lazy restoration - it was that expanding a
    // worktree's row list never itself switched the active tab set the way clicking its own name does,
    // leaving the strip showing whatever worktree was selected before, until a session was clicked one
    // at a time and each click's own `shell.select` finally brought the whole set into view.
    // shell.select (an external-store write, not React state) must not run inside the setState updater
    // below - React can invoke that updater more than once (Strict Mode) or at unexpected times, and
    // triggering an external notification from inside it produced a real "Cannot update a component
    // while rendering a different component" warning, an actual correctness bug (T139-followup), not
    // just React being pedantic - a plain event-handler-time call, before the state update, is correct.
    const expanding = !expandedWorktrees.has(path)
    if (expanding) shell.select(path)
    setExpandedWorktrees((current) => {
      const next = new Set(current)
      if (expanding) next.add(path); else next.delete(path)
      return next
    })
  }

  // Computed only for expanded worktrees; tilesKey is the reactive dependency (see above - broader than agentsKey).
  const entriesByWorktree = useMemo(
    () => new Map([...expandedWorktrees].map((path) => {
      const groupSnapshot = groups.stateFor(path).getSnapshot()
      const activeTile = groupSnapshot.tiles.find(tile => tile.id === groupSnapshot.activeId)
      const active = activeTile === undefined
        ? undefined
        : { id: activeTile.id, ...(activeTile.chatSessionId === undefined ? {} : { chatSessionId: activeTile.chatSessionId }) }
      return [path, entriesForWorktree(path, snapshot.repos, groupSnapshot.tiles, chatRows, active)] as const
    })),
    [snapshot.repos, groups, tilesKey, chatRows, expandedWorktrees],
  )

  const selectAgentEntry = (path: string, tileId: string): void => {
    shell.select(path)
    groups.stateFor(path).selectTile(tileId)
  }

  const selectChatEntry = (path: string, id: string): void => {
    shell.select(path)
    const result = projects.openChat(id)
    if (!result.ok) setNotice(result.reason)
  }

  /** Hover "x" (owner request, T134/T136-followup): an agent/terminal entry closes its actual tab (the
   * row exists only because the tab is open, so it disappears from here the same instant). A chat entry
   * must close its open tab too, not merely dismiss the tree row - dismissing alone left the tab strip
   * showing a tile with no matching row anywhere (owner: "was 2, removed 1, then added 1, i got 3" -
   * the "removed" one never actually left the strip). `requestCloseTile` already calls `dismissChat`
   * itself once it finds a chat tile (`WorkspaceCanvas`'s own `closeTile`), so that is the one path taken
   * when a tile exists; dismissing directly is only the fallback for the rare case where none does yet. */
  const closeEntry = (path: string, entry: WorktreeSessionEntry): void => {
    if (entry.kind === 'agent') { shell.requestCloseTile({ worktree: path, tileId: entry.id }); return }
    const tile = groups.stateFor(path).getSnapshot().tiles.find(candidate => candidate.kind === 'chat' && candidate.chatSessionId === entry.id)
    if (tile !== undefined) shell.requestCloseTile({ worktree: path, tileId: tile.id })
    else shell.dismissChat(entry.id)
  }

  /** Remove a whole workspace from the tree (owner request, T135-followup: "I must be able to remove
   * both workspace and sessions"). */
  const removeRepo = (root: string): void => {
    setNotice(null)
    void projects.removeWorkspace(root).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  const pickWorktree = (path: string): void => {
    setNotice(null)
    shell.select(path)
    // Each branch has its own chat: show the one for this worktree, or start one there.
    void projects.showChat(path).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  const newChat = (path: string): void => {
    setNotice(null)
    shell.select(path)
    void projects.newChat(path).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  const createWorktree = async (repoRoot: string, branch: string): Promise<void> => {
    setNotice(null)
    const result = await projects.newWorktree(repoRoot, branch)
    if (result.ok) setCreatingIn(null)
    else setNotice(result.reason)
  }

  const addProject = async (): Promise<void> => {
    setNotice(null)
    setHint(null)
    if (projects.chooserKind() === 'path') {
      setAddingByPath(open => !open)
      return
    }
    // 'upstream' (macOS, no picker seam): the trigger this clicks lives inside the upstream sidebar, which
    // is hidden by default (searchOpen: false) unless Search is open - same hidden-ancestor bug already
    // fixed once for Settings below. Reveal synchronously (flushSync, not a plain setState) before the
    // click fires, so the native dialog's result is actually registered instead of silently dropped.
    const revealsUpstream = projects.chooserKind() === 'upstream'
    if (revealsUpstream) flushSync(() => { setSearchOpen(true) })
    const result = await projects.addProject()
    if (!result.ok) {
      if (revealsUpstream) setSearchOpen(false)
      setNotice(result.reason)
      return
    }
    if (result.note !== undefined) setHint(result.note)
  }

  const submitPath = async (): Promise<void> => {
    if (addingBusy) return
    setAddingBusy(true)
    setNotice(null)
    const result = await projects.addProjectByPath(projectPath)
    setAddingBusy(false)
    if (result.ok) { setAddingByPath(false); setProjectPath('') }
    else setNotice(result.reason)
  }

  if (collapsed) return <>{renderUpstream()}</>

  return (
    <div className="dshWorkspaceSide" data-acryl-workspace-side="tree">
      <div className="dshWorkspaceSideChats" hidden={!searchOpen}>
        <div className="dshWorkspaceSideProjectsHead">
          <button
            type="button"
            className="dshWorkspaceSideBack"
            aria-label="Back to Workspaces"
            title="Back to Workspaces"
            onClick={() => { setSearchOpen(false) }}
          >
            ← Back to Workspaces
          </button>
          <span>All chats</span>
        </div>
        {renderUpstream()}
      </div>
      <div className="dshWorkspaceSideProjects" hidden={searchOpen}>
        <div className="dshWorkspaceSideBrandRow">
          <AcrylMarkIcon size={20} />
          <span className="dshWorkspaceSideBrandName">ACRYL</span>
          <button
            type="button"
            className="dshWorkspaceSideCollapse"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            onClick={onToggleCollapse}
          >
            <CollapseSidebarIcon />
          </button>
        </div>
        <div className="dshWorkspaceSideProjectsHead">
          <span>Workspaces</span>
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-pressed={searchOpen}
            aria-label="All chats (classic view, with search)"
            title="All chats (classic view, with search)"
            onClick={() => { setSearchOpen(true) }}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-label="Add git project"
            title="Add a workspace: choose any folder - a git repository or a plain folder both work"
            onClick={() => { void addProject() }}
          >
            +
          </button>
        </div>
        {addingByPath && (
          <form className="dshWorkspaceNewBranch" aria-label="Add a git project by path" onSubmit={(event) => { event.preventDefault(); void submitPath() }}>
            <input
              aria-label="Project folder path"
              placeholder="/absolute/path/to/a/git/repository"
              autoFocus
              spellCheck={false}
              value={projectPath}
              onChange={(event) => { setProjectPath(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Escape') setAddingByPath(false) }}
            />
            <button type="submit" disabled={addingBusy || projectPath.trim() === ''}>{addingBusy ? 'Adding...' : 'Add'}</button>
          </form>
        )}
        {notice !== null && (
          <p className="dshWorkspaceSideNotice" role="alert">{notice}</p>
        )}
        {hint !== null && (
          <p className="dshWorkspaceSideHint" role="status">{hint}</p>
        )}
        {repos.length === 0 && (
          <div className="dshWorkspaceSideEmpty">
            No workspaces yet. Use + to add a folder - a git repository or a plain folder both work - or open a chat in one.
          </div>
        )}
        {repos.map(repo => (
          <RepoSection
            key={repo.root}
            repo={repo}
            collapsed={collapsedRepos.has(repo.root)}
            onToggleCollapse={() => { toggleRepo(repo.root) }}
            expandedWorktrees={expandedWorktrees}
            onToggleWorktree={toggleWorktree}
            entriesByWorktree={entriesByWorktree}
            onSelectAgent={selectAgentEntry}
            onSelectChat={selectChatEntry}
            onCloseEntry={closeEntry}
            onRemove={() => { removeRepo(repo.root) }}
            onSelect={pickWorktree}
            onNewChat={newChat}
            customAgents={customAgents}
            creating={creatingIn === repo.root}
            onToggleCreate={() => { setNotice(null); setCreatingIn(creatingIn === repo.root ? null : repo.root) }}
            onCreate={(branch) => createWorktree(repo.root, branch)}
          />
        ))}
        <div className="dshWorkspaceSideFoot">
          <button
            type="button"
            className="dshWorkspaceSideFootButton"
            onClick={() => {
              // The Settings dialog is not a portal - it renders as a plain sibling of its trigger button,
              // which lives inside the upstream sidebar. That sidebar is hidden (searchOpen: false) unless
              // Search is open, and a hidden ancestor hides anything that mounts inside it later, dialog
              // included. Reveal it synchronously (flushSync, not a plain setState) so the trigger's click,
              // fired right after, opens a dialog that is actually on screen instead of hidden with it.
              // On a refusal, revert: the tree (not the now-empty upstream panel) is where the notice shows.
              flushSync(() => { setSearchOpen(true) })
              const result = projects.openSettings()
              if (result.ok) { setNotice(null); return }
              setSearchOpen(false)
              setNotice(result.reason)
            }}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M13.5 13.5L10.4 10.4" />
    </svg>
  )
}

interface RepoSectionProps {
  readonly repo: RepoRow
  readonly collapsed: boolean
  readonly onToggleCollapse: () => void
  readonly expandedWorktrees: ReadonlySet<string>
  readonly onToggleWorktree: (path: string) => void
  readonly entriesByWorktree: ReadonlyMap<string, readonly WorktreeSessionEntry[]>
  readonly onSelectAgent: (path: string, tileId: string) => void
  readonly onSelectChat: (path: string, id: string) => void
  readonly onCloseEntry: (path: string, entry: WorktreeSessionEntry) => void
  /** Remove this whole workspace from the tree (T135-followup hover "x"). */
  readonly onRemove: () => void
  readonly onSelect: (path: string) => void
  readonly onNewChat: (path: string) => void
  readonly customAgents: readonly CustomAgent[]
  readonly creating: boolean
  readonly onToggleCreate: () => void
  readonly onCreate: (branch: string) => Promise<void>
}

/** Top level of the tree: a workspace (a git repository or a plain folder), its own chevron collapsing
 * every branch/worktree under it. */
function RepoSection({
  repo, collapsed, onToggleCollapse, expandedWorktrees, onToggleWorktree, entriesByWorktree, onSelectAgent, onSelectChat,
  onCloseEntry, onRemove, onSelect, onNewChat, customAgents, creating, onToggleCreate, onCreate,
}: RepoSectionProps) {
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    const name = branch.trim()
    if (name === '' || busy) return
    setBusy(true)
    await onCreate(name)
    setBusy(false)
  }
  return (
    <section className="dshWorkspaceRepo" aria-label={repo.name}>
      <div className="dshWorkspaceRepoHead">
        <button
          type="button"
          className="dshWorkspaceChevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${repo.name}` : `Collapse ${repo.name}`}
          onClick={onToggleCollapse}
        >
          <ChevronIcon open={!collapsed} />
        </button>
        <span className="dshWorkspaceRepoKind" title={repo.git ? 'Git repository' : 'Plain folder (not a git repository)'}>
          {repo.git ? <GitRepoIcon /> : <FolderIcon />}
        </span>
        <h3 className="dshWorkspaceRepoName" title={repo.root}>{repo.name}</h3>
        {repo.git && (
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-label={`New branch in ${repo.name}`}
            title="Create a new branch in its own worktree"
            aria-expanded={creating}
            onClick={onToggleCreate}
          >
            +
          </button>
        )}
        <button
          type="button"
          className="dshWorkspaceRepoRemove"
          aria-label={`Remove ${repo.name}`}
          title={`Remove ${repo.name} from Workspaces`}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      {creating && (
        <form
          className="dshWorkspaceNewBranch"
          onSubmit={(event) => { event.preventDefault(); void submit() }}
        >
          <input
            aria-label="New branch name"
            placeholder="feature/my-change"
            autoFocus
            value={branch}
            onChange={(event) => { setBranch(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Escape') onToggleCreate() }}
          />
          <button type="submit" disabled={busy || branch.trim() === ''}>{busy ? 'Creating...' : 'Create'}</button>
        </form>
      )}
      {!collapsed && (
        <ul className="dshWorkspaceWorktrees">
          {repo.rows.map(row => (
            <li key={row.path} className="dshWorkspaceWorktreeItem">
              <div className="dshWorkspaceWorktreeRow">
                <button
                  type="button"
                  className="dshWorkspaceChevron"
                  aria-expanded={expandedWorktrees.has(row.path)}
                  aria-label={expandedWorktrees.has(row.path) ? `Collapse sessions on ${row.label}` : `Show sessions on ${row.label}`}
                  onClick={() => { onToggleWorktree(row.path) }}
                >
                  <ChevronIcon open={expandedWorktrees.has(row.path)} />
                </button>
                <WorktreeButton row={row} onSelect={onSelect} customAgents={customAgents} />
                <button
                  type="button"
                  className="dshWorkspaceWorktreeNew"
                  aria-label={`New chat on ${row.label}`}
                  title={`New chat on ${row.label}`}
                  onClick={() => { onNewChat(row.path) }}
                >
                  +
                </button>
              </div>
              {expandedWorktrees.has(row.path) && (
                <WorktreeSessions
                  path={row.path}
                  entries={entriesByWorktree.get(row.path) ?? []}
                  customAgents={customAgents}
                  onSelectAgent={onSelectAgent}
                  onSelectChat={onSelectChat}
                  onCloseEntry={onCloseEntry}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function WorktreeButton({ row, onSelect, customAgents }: { row: WorktreeRow; onSelect: (path: string) => void; customAgents: readonly CustomAgent[] }) {
  return (
    <button
      type="button"
      className="dshWorkspaceWorktree"
      aria-pressed={row.selected}
      title={row.path}
      onClick={() => { onSelect(row.path) }}
    >
      <span className="dshWorkspaceDot" data-dot={row.dot} role="img" aria-label={DOT_LABEL[row.dot]} />
      <span className="dshWorkspaceWorktreeLabel">{row.label}</span>
      {row.agents.length > 0 && (
        <span className="dshWorkspaceWorktreeAgents" title={`Agents open here: ${row.agents.join(', ')}`}>
          {row.agents.slice(0, MAX_ROW_AGENTS).map(id => <AgentIcon key={id} commandId={id} custom={customAgents.find(agent => agent.id === id)?.badge} />)}
          {row.agents.length > MAX_ROW_AGENTS && <span className="dshWorkspaceWorktreeMore">+{row.agents.length - MAX_ROW_AGENTS}</span>}
        </span>
      )}
      {row.sessions > 0 && <span className="dshWorkspaceWorktreeSessions" title="Chat sessions here">{row.sessions}</span>}
      {(row.added > 0 || row.removed > 0) && (
        <span className="dshWorkspaceWorktreeStat">
          <span data-kind="add">+{row.added}</span> <span data-kind="remove">-{row.removed}</span>
        </span>
      )}
      {row.added === 0 && row.removed === 0 && row.changeCount > 0 && (
        <span className="dshWorkspaceWorktreeStat">{row.changeCount}</span>
      )}
    </button>
  )
}

/**
 * Nested level under an expanded worktree (spec 040 T129): every running agent/terminal tab and every
 * AcrylDSH Chat scoped to it - never a file, browser, diff, board or doc tab.
 */
function WorktreeSessions({
  path, entries, customAgents, onSelectAgent, onSelectChat, onCloseEntry,
}: {
  readonly path: string
  readonly entries: readonly WorktreeSessionEntry[]
  readonly customAgents: readonly CustomAgent[]
  readonly onSelectAgent: (path: string, tileId: string) => void
  readonly onSelectChat: (path: string, id: string) => void
  /** Hover "x" (owner request, T134-followup): removes an agent/terminal tab or hides a chat, from
   * both this list and the tab strip at once. */
  readonly onCloseEntry: (path: string, entry: WorktreeSessionEntry) => void
}) {
  if (entries.length === 0) {
    return <p className="dshWorkspaceSessionsEmpty">Nothing running here yet.</p>
  }
  return (
    <ul className="dshWorkspaceSessions">
      {entries.map(entry => (
        <li key={`${entry.kind}-${entry.id}`} className="dshWorkspaceSessionItem">
          <button
            type="button"
            className="dshWorkspaceSessionRow"
            title={entry.label}
            aria-pressed={entry.active === true}
            onClick={() => { if (entry.kind === 'agent') onSelectAgent(path, entry.id); else onSelectChat(path, entry.id) }}
          >
            {entry.kind === 'agent'
              ? <AgentIcon commandId={entry.commandId ?? 'shell'} custom={customAgents.find(agent => agent.id === entry.commandId)?.badge} />
              : <ChatIcon />}
            <span className="dshWorkspaceSessionLabel">{entry.label}</span>
            {entry.running === true && <span className="dshWorkspaceDot" data-dot="running" role="img" aria-label="Running" />}
          </button>
          <button
            type="button"
            className="dshWorkspaceSessionClose"
            aria-label={`Close ${entry.label}`}
            title={`Close ${entry.label}`}
            onClick={(event) => { event.stopPropagation(); onCloseEntry(path, entry) }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
