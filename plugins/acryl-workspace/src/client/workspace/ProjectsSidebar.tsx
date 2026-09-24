/** Left pane: a Chats | Projects switch around the upstream sidebar, with the git-aware Projects list. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { ProjectsControl } from './projects-control.ts'
import { buildProjectRows, type RepoRow, type WorktreeDot, type WorktreeRow } from './sidebar-model.ts'
import type { WorkspaceShellState } from './shell-state.ts'

export interface ProjectsSidebarOwnerProps {
  readonly collapsed: boolean
  readonly width: number
  readonly renderUpstream: () => ReactNode
}

export type ProjectsSidebarProps = Omit<PropsRuntime<'root'>, 'useSessions'> & ProjectsSidebarOwnerProps & {
  readonly useSessions: UseSessions
  readonly shell: WorkspaceShellState
  readonly projects: ProjectsControl
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
export function ProjectsSidebar({ collapsed, renderUpstream, useSessions, shell, projects }: ProjectsSidebarProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const sessions = useSessions(state => state)
  const workspaceKey = useSyncExternalStore(projects.subscribeWorkspaces, () => projects.workspaceKey())
  const [notice, setNotice] = useState<string | null>(null)

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

  const repos = useMemo(
    () => buildProjectRows(snapshot, sessions.ids.flatMap((id) => {
      const row = sessions.byId[id]
      return row === undefined ? [] : [row]
    })),
    [snapshot, sessions],
  )

  const pickWorktree = (path: string): void => {
    setNotice(null)
    shell.select(path)
    // Each branch has its own chat: show the one for this worktree, or start one there.
    void projects.showChat(path).then((result) => { if (!result.ok) setNotice(result.reason) })
  }

  const addProject = async (): Promise<void> => {
    setNotice(null)
    const result = await projects.addProject()
    if (!result.ok) setNotice(result.reason)
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
          {repos.length === 0 && (
            <div className="dshWorkspaceSideEmpty">
              No git projects yet. Use + to add a folder that is a git repository, or open a chat in one.
              Switch to Chats for sessions and Settings.
            </div>
          )}
          {repos.map(repo => (
            <RepoSection key={repo.root} repo={repo} onSelect={pickWorktree} />
          ))}
        </div>
      )}
    </div>
  )
}

function RepoSection({ repo, onSelect }: { repo: RepoRow; onSelect: (path: string) => void }) {
  return (
    <section className="dshWorkspaceRepo" aria-label={repo.name}>
      <h3 className="dshWorkspaceRepoName" title={repo.root}>{repo.name}</h3>
      <ul className="dshWorkspaceWorktrees">
        {repo.rows.map(row => (
          <li key={row.path}>
            <WorktreeButton row={row} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function WorktreeButton({ row, onSelect }: { row: WorktreeRow; onSelect: (path: string) => void }) {
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
