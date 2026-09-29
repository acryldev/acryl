/** Left pane: one workspace-first tree (spec 040 T128-130) - no Chats | Projects mode switch. Each repo and
 * each of its branches/worktrees collapses independently; an expanded worktree lists its running agent/
 * terminal tabs and its AcrylDSH Chat sessions, never a file/browser/diff/board/doc tab. The upstream
 * sidebar (search, and anything else it owns) stays reachable behind a Search toggle instead of a mode. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { CustomAgent } from '../../agents/definition.ts'
import { ChatIcon, ChevronIcon } from '../agents/controls.tsx'
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
export function ProjectsSidebar({ collapsed, renderUpstream, useSessions, shell, projects, groups, agents, status }: ProjectsSidebarProps) {
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

  // Registered workspace folders are projects even before they have a chat.
  useEffect(() => {
    for (const path of projects.workspacePaths()) void shell.discover(path)
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
  // agentsKey above, which deliberately drops plain terminals since it only feeds the row icons.
  const tilesKey = useSyncExternalStore(
    useCallback((listener: () => void) => groups.onChange(listener), [groups]),
    () => JSON.stringify(groups.keys().map(key => [key, groups.stateFor(key).getSnapshot().tiles.filter(tile => tile.kind === 'pty').map(tile => [tile.id, tile.title, tile.commandId])])),
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
      const row = sessions.byId[id]
      return row === undefined ? [] : [{ id, blank: row.blank, running: row.running, ...(row.cwd === undefined ? {} : { cwd: row.cwd }) }]
    }),
    [sessions],
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
    setExpandedWorktrees((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  // Computed only for expanded worktrees; tilesKey is the reactive dependency (see above - broader than agentsKey).
  const entriesByWorktree = useMemo(
    () => new Map([...expandedWorktrees].map(path => [path, entriesForWorktree(path, snapshot.repos, groups.stateFor(path).getSnapshot().tiles, chatRows)] as const)),
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
    const result = await projects.addProject()
    if (!result.ok) setNotice(result.reason)
    else if (result.note !== undefined) setHint(result.note)
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
            aria-label="Back to the workspace tree"
            title="Back to the workspace tree"
            onClick={() => { setSearchOpen(false) }}
          >
            ← Back
          </button>
          <span>Search</span>
        </div>
        {renderUpstream()}
      </div>
      <div className="dshWorkspaceSideProjects" hidden={searchOpen}>
        <div className="dshWorkspaceSideProjectsHead">
          <span>Workspaces</span>
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-pressed={searchOpen}
            aria-label="Search chats and settings"
            title="Search chats and settings"
            onClick={() => { setSearchOpen(true) }}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="dshWorkspaceSideAdd"
            aria-label="Add git project"
            title="Add a git project: choose a folder that is a git repository"
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
            No git projects yet. Use + to add a folder that is a git repository, or open a chat in one.
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
              const result = projects.openSettings()
              setNotice(result.ok ? null : result.reason)
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
  readonly onSelect: (path: string) => void
  readonly onNewChat: (path: string) => void
  readonly customAgents: readonly CustomAgent[]
  readonly creating: boolean
  readonly onToggleCreate: () => void
  readonly onCreate: (branch: string) => Promise<void>
}

/** Top level of the tree: a workspace (git repository), its own chevron collapsing every branch/worktree under it. */
function RepoSection({
  repo, collapsed, onToggleCollapse, expandedWorktrees, onToggleWorktree, entriesByWorktree, onSelectAgent, onSelectChat,
  onSelect, onNewChat, customAgents, creating, onToggleCreate, onCreate,
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
        <h3 className="dshWorkspaceRepoName" title={repo.root}>{repo.name}</h3>
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
  path, entries, customAgents, onSelectAgent, onSelectChat,
}: {
  readonly path: string
  readonly entries: readonly WorktreeSessionEntry[]
  readonly customAgents: readonly CustomAgent[]
  readonly onSelectAgent: (path: string, tileId: string) => void
  readonly onSelectChat: (path: string, id: string) => void
}) {
  if (entries.length === 0) {
    return <p className="dshWorkspaceSessionsEmpty">Nothing running here yet.</p>
  }
  return (
    <ul className="dshWorkspaceSessions">
      {entries.map(entry => (
        <li key={`${entry.kind}-${entry.id}`}>
          <button
            type="button"
            className="dshWorkspaceSessionRow"
            title={entry.label}
            onClick={() => { if (entry.kind === 'agent') onSelectAgent(path, entry.id); else onSelectChat(path, entry.id) }}
          >
            {entry.kind === 'agent'
              ? <AgentIcon commandId={entry.commandId ?? 'shell'} custom={customAgents.find(agent => agent.id === entry.commandId)?.badge} />
              : <ChatIcon />}
            <span className="dshWorkspaceSessionLabel">{entry.label}</span>
            {entry.running === true && <span className="dshWorkspaceDot" data-dot="running" role="img" aria-label="Running" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
