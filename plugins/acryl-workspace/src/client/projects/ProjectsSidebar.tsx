/** Left pane: one workspace-first tree (spec 040 T128-130) - no Chats | Projects mode switch. Each repo and
 * each of its branches/worktrees collapses independently; an expanded worktree lists its running agent/
 * terminal tabs and its AcrylDSH Chat sessions, never a file/browser/diff/board/doc tab. The upstream
 * sidebar is mounted only as an invisible host for Settings (see `dshWorkspaceUpstreamHost`); there is no
 * second, classic list to switch to. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime, UseSessions } from '@acryl/ui/frame'
import { AcrylMarkIcon, CollapseSidebarIcon } from '../agents/controls.tsx'
import type { AgentsState } from '../agents/agents-state.ts'
import type { WorkspaceGroups } from '../canvas/groups.ts'
import { agentsByWorktree } from '../chrome/worktree-agents.ts'
import type { ProjectsControl } from './projects-control.ts'
import type { UpstreamPanels } from './upstream-panels.ts'
import { attentionByWorktree, type WorktreeAttention } from '../status/attention-model.ts'
import type { AgentStatusState } from '../status/agent-status-state.ts'
import { buildProjectRows, entriesForWorktree, reposInWorkspace, type WorktreeSessionEntry } from './sidebar-model.ts'
import type { DesktopSidebarSurfaceOwnerProps } from 'acryl-app-shell/client'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { ChatSelection } from '../chat/chat-selection.ts'
import { RepoSection } from './RepoSection.tsx'
import { WorkspaceStrip } from './WorkspaceStrip.tsx'
import { NewWorkspaceDialog, type NewWorkspaceInput } from './NewWorkspaceDialog.tsx'
import { DEFAULT_WORKSPACE_ID } from '../../projects/contract.ts'

/** The left-pane owner interface the frame offers: the same one the frame's default sidebar receives. */
export type ProjectsSidebarOwnerProps = DesktopSidebarSurfaceOwnerProps

export type ProjectsSidebarProps = Omit<PropsRuntime<'root'>, 'useSessions'> & ProjectsSidebarOwnerProps & {
  readonly useSessions: UseSessions
  readonly shell: WorkspaceShellState
  readonly projects: ProjectsControl
  /** Which chat is shown: picking or expanding a worktree shows its chat through it. */
  readonly chats: ChatSelection
  /** The tab groups, to show which agents are open in each worktree. */
  readonly groups: WorkspaceGroups
  /** The user's custom agents, for their badges. */
  readonly agents: AgentsState
  /** What each terminal agent reports it is doing, for the "needs you" dot. */
  readonly status: AgentStatusState
  /** The pages DSH's own plugins contribute to its sidebar (Plugins, Automation tasks, ...), which this pane lists above Settings. */
  readonly panels: UpstreamPanels
}

/**
 * The advanced shell's left pane: one workspace-first tree (spec 040 T128-130), nesting workspace ->
 * branch/worktree, each independently collapsible. An expanded worktree lists its running agent/terminal
 * tabs and its AcrylDSH Chat sessions - never a file, browser, diff, board or doc tab, so the tree cannot
 * be polluted the way a flat "everything open" list would be. The upstream sidebar (its search, and
 * anything else it owns) is mounted only to host Settings' trigger and dialog, never shown as a view.
 */
export function ProjectsSidebar({ collapsed, renderUpstream, onToggleCollapse, useSessions, shell, projects, chats, groups, agents, status, panels }: ProjectsSidebarProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const sessions = useSessions(state => state)
  const projectsKey = useSyncExternalStore(projects.subscribeProjects, () => projects.projectsKey())
  const upstreamPanels = useSyncExternalStore(panels.subscribe, panels.list)
  const activePanel = useSyncExternalStore(panels.subscribe, panels.active)
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

  // Registered project folders are projects even before they have a chat. registerFolder: true - each came from an explicit "add this
  // folder", unlike the passive discovery of chats' folders (ChatSelection), which never makes a folder a project.
  useEffect(() => {
    for (const path of projects.projectPaths()) void shell.discover(path, { registerFolder: true })
  }, [shell, projects, projectsKey])

  // The agents open per worktree, kept as a stable text key so unrelated tab changes do not re-render the list.
  const agentsKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify([...agentsByWorktree(new Map(groups.keys().map(key => [key, groups.stateFor(key).getSnapshot().tiles] as const)))]),
  )
  // Every pty tile (named agent or plain terminal), for the expanded-worktree session list - broader than
  // agentsKey above, which deliberately drops plain terminals since it only feeds the row icons. Also
  // each worktree's activeId, so the row of the tab selected in the strip is highlighted here too.
  const tilesKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify(groups.keys().map((key) => {
      const state = groups.stateFor(key).getSnapshot()
      return [key, state.activeId, state.tiles.filter(tile => tile.kind === 'pty' || tile.kind === 'chat').map(tile => [tile.id, tile.title, tile.commandId, tile.chatSessionId])]
    })),
  )
  // The chats with a tab per worktree: a row counts these (and running ones), the chats its list shows up front.
  const openChatsKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify(groups.keys().map(key => [key, groups.stateFor(key).getSnapshot().tiles.flatMap(tile => tile.kind === 'chat' && tile.chatSessionId !== undefined ? [tile.chatSessionId] : [])])),
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
      if (snapshot.dismissedChats.has(id)) return [] // hidden from the tree, the dot count and the tab strip alike
      const row = sessions.byId[id]
      return row === undefined ? [] : [{ id, blank: row.blank, running: row.running, displayTitle: row.displayTitle, ...(row.title === undefined ? {} : { title: row.title }), ...(row.cwd === undefined ? {} : { cwd: row.cwd }) }]
    }),
    [sessions, snapshot.dismissedChats],
  )
  const workspaces = useSyncExternalStore(projects.subscribeProjects, () => projects.workspaces())
  const currentWorkspace = useSyncExternalStore(projects.subscribeProjects, () => projects.currentWorkspace())
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const allRepos = useMemo(
    () => buildProjectRows(
      snapshot,
      chatRows,
      new Map(JSON.parse(agentsKey) as Array<[string, string[]]>),
      new Map(JSON.parse(attentionKey) as Array<[string, WorktreeAttention]>),
      new Map((JSON.parse(openChatsKey) as Array<[string, string[]]>).map(([key, ids]) => [key, new Set(ids)] as const)),
    ),
    [snapshot, chatRows, agentsKey, attentionKey, openChatsKey],
  )
  // The sidebar is the shown workspace: its projects, and the worktree on screen.
  const repos = useMemo(
    () => reposInWorkspace(allRepos, projects.projectPaths(), snapshot.selectedPath),
    [allRepos, projects, projectsKey, snapshot.selectedPath],
  )

  const toggleRepo = (root: string): void => {
    setCollapsedRepos((current) => {
      const next = new Set(current)
      if (next.has(root)) next.delete(root); else next.add(root)
      return next
    })
  }

  /** Select a worktree and show its chat: the chat tab it has selected, else its latest chat, else a new one there. */
  const showWorktree = (path: string): void => {
    chats.showWorktree(path, () => { void projects.showChat(path).then((result) => { if (!result.ok) setNotice(result.reason) }) })
  }

  const toggleWorktree = (path: string): void => {
    // Expanding a worktree shows it, as picking its name does: its tab set and its chat.
    // Selecting writes an external store, so it runs here in the handler, never inside the setState updater below (React may call an
    // updater more than once, and a store notification from inside one is an update during another component's render).
    const expanding = !expandedWorktrees.has(path)
    if (expanding) showWorktree(path)
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
    void projects.openChat(id).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  /** The hover "x": an agent or terminal entry closes its tab; a chat entry is hidden from the tree and the tab strip (it would come back as
   * an eager tab otherwise), and its open tab closes. */
  const closeEntry = (path: string, entry: WorktreeSessionEntry): void => {
    if (entry.kind === 'agent') { shell.requestCloseTile({ worktree: path, tileId: entry.id }); return }
    const tile = groups.stateFor(path).getSnapshot().tiles.find(candidate => candidate.kind === 'chat' && candidate.chatSessionId === entry.id)
    shell.dismissChat(entry.id)
    if (tile !== undefined) shell.requestCloseTile({ worktree: path, tileId: tile.id })
  }

  /** Rename in place from the tree; the tab strip follows. An agent/terminal
   * entry is its tab's own title, so renaming the tile is the whole job (the strip and this row both read
   * it). A chat entry renames the session itself; its open tab then follows the session's new title. */
  const renameEntry = (path: string, entry: WorktreeSessionEntry, title: string): void => {
    setNotice(null)
    if (entry.kind === 'agent') { groups.stateFor(path).renameTile(entry.id, title); return }
    void projects.renameChat(entry.id, title).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  /** Remove a whole workspace from the tree. */
  const removeRepo = (root: string): void => {
    setNotice(null)
    void projects.removeWorkspace(root).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  const pickWorktree = (path: string): void => {
    setNotice(null)
    showWorktree(path)
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
    const result = await projects.addProject()
    if (!result.ok) {
      // No chooser on this machine: offer typing the path, as a hint rather than an error.
      if (result.needsPath === true) { setAddingByPath(true); setHint(result.reason); return }
      setNotice(result.reason)
      return
    }
    if (result.note !== undefined) setHint(result.note)
  }

  /** Show another workspace; its tabs and worktree follow (`followShownWorkspace`). */
  const switchWorkspace = async (id: string): Promise<void> => {
    setNotice(null)
    const result = await projects.switchWorkspace(id)
    if (!result.ok) setNotice(result.reason)
  }

  const createWorkspace = async (input: NewWorkspaceInput): Promise<string | null> => {
    const result = await projects.createWorkspace(input)
    if (!result.ok) return result.reason
    setCreatingWorkspace(false)
    return null
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
      {/* Not a view: the upstream sidebar is mounted only because Settings' trigger, and its dialog, live
          inside it - no service opens Settings any other way. Kept out of sight at zero size; never shown, so there is no "classic" list
          to maintain. `aria-hidden` (not just zero size) so the `ui_snapshot` reader leaves its subtree out of what an agent sees: its own
          "Collapse sidebar" control would otherwise appear beside the tree's, two indistinguishable buttons. Real-click paths (the
          "Settings" button below, `openSettings`) use `Element.click()`, which `aria-hidden` does not block. */}
      <div className="dshWorkspaceUpstreamHost" aria-hidden="true">{renderUpstream()}</div>
      <div className="dshWorkspaceSideProjects">
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
          <span>Projects</span>
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-label="Add project"
            title="Add a project to this workspace: any folder - a git repository or a plain folder both work"
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
            {currentWorkspace === DEFAULT_WORKSPACE_ID
              ? `No projects yet. Use + to add a folder - a git repository or a plain folder both work${projects.chatAvailable ? ' - or open a chat in one' : ''}.`
              : 'No projects in this workspace yet. Use + to add a folder - a git repository or a plain folder both work.'}
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
            onRenameEntry={renameEntry}
            onRemove={() => { removeRepo(repo.root) }}
            onSelect={pickWorktree}
            onNewChat={projects.chatAvailable ? newChat : undefined}
            customAgents={customAgents}
            creating={creatingIn === repo.root}
            onToggleCreate={() => { setNotice(null); setCreatingIn(creatingIn === repo.root ? null : repo.root) }}
            onCreate={(branch) => createWorktree(repo.root, branch)}
          />
        ))}
        <div className="dshWorkspaceSideFoot">
          {upstreamPanels.map(panel => (
            <button
              key={panel.id}
              type="button"
              className="dshWorkspaceSideFootButton"
              aria-current={activePanel === panel.id ? 'page' : undefined}
              onClick={() => { panels.select(panel.id) }}
            >
              {panel.label}
            </button>
          ))}
          <button
            type="button"
            className="dshWorkspaceSideFootButton"
            onClick={() => {
              // Settings keeps its open state inside its own component (no service to call), so this
              // activates its real trigger inside the upstream host above - see `openSettings`.
              const result = projects.openSettings()
              setNotice(result.ok ? null : result.reason)
            }}
          >
            Settings
          </button>
        </div>
      </div>
      <WorkspaceStrip
        workspaces={workspaces}
        current={currentWorkspace}
        onAddProject={() => { void addProject() }}
        onSwitch={(id) => { void switchWorkspace(id) }}
        onNew={() => { setCreatingWorkspace(true) }}
      />
      {creatingWorkspace && <NewWorkspaceDialog onCreate={createWorkspace} onCancel={() => { setCreatingWorkspace(false) }} />}
    </div>
  )
}
