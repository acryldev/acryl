/** Left pane: a Chats | Projects switch around the upstream sidebar, with the git-aware Projects list. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { CustomAgent } from '../../agents/definition.ts'
import type { AgentsState } from '../agents/agents-state.ts'
import type { WorkspaceGroups } from '../canvas/groups.ts'
import { agentsByWorktree, MAX_ROW_AGENTS } from '../chrome/worktree-agents.ts'
import { AgentIcon } from '../tabs/AgentIcon.tsx'
import type { ProjectsControl } from './projects-control.ts'
import { buildProjectRows, type RepoRow, type WorktreeDot, type WorktreeRow } from './sidebar-model.ts'
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
}

const DOT_LABEL: Record<WorktreeDot, string> = {
  error: 'Status unavailable',
  running: 'Agent running',
  done: 'Agent finished, not yet opened',
  loading: 'Loading',
  dirty: 'Uncommitted changes',
  clean: 'Clean',
}

/**
 * The advanced shell's left pane. Chats mode is the unchanged upstream sidebar (kept mounted, so
 * its search and scroll survive a switch); Projects mode lists every git repository and worktree
 * behind the open chat sessions, with a status dot per worktree.
 */
export function ProjectsSidebar({ collapsed, renderUpstream, useSessions, shell, projects, groups, agents }: ProjectsSidebarProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const sessions = useSessions(state => state)
  const workspaceKey = useSyncExternalStore(projects.subscribeWorkspaces, () => projects.workspaceKey())
  const [notice, setNotice] = useState<string | null>(null)
  /** A neutral hint (not an error), for actions that continue in another part of the UI. */
  const [hint, setHint] = useState<string | null>(null)
  /** The repository whose "new branch" form is open. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null)

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
  const customAgents = useSyncExternalStore(agents.subscribe, agents.getSnapshot)
  const repos = useMemo(
    () => buildProjectRows(snapshot, sessions.ids.flatMap((id) => {
      const row = sessions.byId[id]
      return row === undefined ? [] : [row]
    }), new Map(JSON.parse(agentsKey) as Array<[string, string[]]>)),
    [snapshot, sessions, agentsKey],
  )

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
    const result = await projects.addProject()
    if (!result.ok) setNotice(result.reason)
    else if (result.note !== undefined) setHint(result.note)
  }

  if (collapsed) return <>{renderUpstream()}</>

  return (
    <div className="dshWorkspaceSide" data-acryl-workspace-side={snapshot.mode}>
      <div className="dshWorkspaceSideSwitch" role="tablist" aria-label="Sidebar view">
        <button
          type="button"
          role="tab"
          aria-selected={snapshot.mode === 'chats'}
          onClick={() => { shell.setMode('chats') }}
        >
          Chats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={snapshot.mode === 'projects'}
          onClick={() => { shell.setMode('projects') }}
        >
          Projects
        </button>
      </div>
      <div className="dshWorkspaceSideChats" hidden={snapshot.mode !== 'chats'}>
        {renderUpstream()}
      </div>
      {snapshot.mode === 'projects' && (
        <div className="dshWorkspaceSideProjects" role="tabpanel">
          <div className="dshWorkspaceSideProjectsHead">
            <span>Projects</span>
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
          {notice !== null && (
            <p className="dshWorkspaceSideNotice" role="alert">{notice}</p>
          )}
          {hint !== null && (
            <p className="dshWorkspaceSideHint" role="status">{hint}</p>
          )}
          {repos.length === 0 && (
            <div className="dshWorkspaceSideEmpty">
              No git projects yet. Use + to add a folder that is a git repository, or open a chat in one.
              Switch to Chats for sessions and Settings.
            </div>
          )}
          {repos.map(repo => (
            <RepoSection
              key={repo.root}
              repo={repo}
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
      )}
    </div>
  )
}

interface RepoSectionProps {
  readonly repo: RepoRow
  readonly onSelect: (path: string) => void
  readonly onNewChat: (path: string) => void
  readonly customAgents: readonly CustomAgent[]
  readonly creating: boolean
  readonly onToggleCreate: () => void
  readonly onCreate: (branch: string) => Promise<void>
}

function RepoSection({ repo, onSelect, onNewChat, customAgents, creating, onToggleCreate, onCreate }: RepoSectionProps) {
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
      <ul className="dshWorkspaceWorktrees">
        {repo.rows.map(row => (
          <li key={row.path} className="dshWorkspaceWorktreeItem">
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
          </li>
        ))}
      </ul>
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
