/** The tree's rows: a workspace (repository or folder) with its worktrees, each worktree's button and its expanded list of agents and chats.
 * Rendering only; every action is a callback from `ProjectsSidebar`. */

import { useState } from 'react'
import type { CustomAgent } from '../../agents/definition.ts'
import { ChatIcon, ChevronIcon, FolderIcon, GitRepoIcon } from '../agents/controls.tsx'
import { MAX_ROW_AGENTS } from '../chrome/worktree-agents.ts'
import { AgentIcon } from '../tabs/AgentIcon.tsx'
import type { RepoRow, WorktreeDot, WorktreeRow, WorktreeSessionEntry } from './sidebar-model.ts'

const DOT_LABEL: Record<WorktreeDot, string> = {
  error: 'Status unavailable',
  attention: 'An agent needs you',
  running: 'Agent running',
  done: 'Agent finished, not yet opened',
  loading: 'Loading',
  dirty: 'Uncommitted changes',
  clean: 'Clean',
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
  readonly onRenameEntry: (path: string, entry: WorktreeSessionEntry, title: string) => void
  /** Remove this whole workspace from the tree (its hover "x"). */
  readonly onRemove: () => void
  readonly onSelect: (path: string) => void
  /** Undefined when the DSH chat is off: there is no chat to start, so no button for it. */
  readonly onNewChat: ((path: string) => void) | undefined
  readonly customAgents: readonly CustomAgent[]
  readonly creating: boolean
  readonly onToggleCreate: () => void
  readonly onCreate: (branch: string) => Promise<void>
}

/** Top level of the tree: a workspace (a git repository or a plain folder), its own chevron collapsing
 * every branch/worktree under it. */
export function RepoSection({
  repo, collapsed, onToggleCollapse, expandedWorktrees, onToggleWorktree, entriesByWorktree, onSelectAgent, onSelectChat,
  onCloseEntry, onRenameEntry, onRemove, onSelect, onNewChat, customAgents, creating, onToggleCreate, onCreate,
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
                {onNewChat !== undefined && (
                  <button
                    type="button"
                    className="dshWorkspaceWorktreeNew"
                    aria-label={`New chat on ${row.label}`}
                    title={`New chat on ${row.label}`}
                    onClick={() => { onNewChat(row.path) }}
                  >
                    +
                  </button>
                )}
              </div>
              {expandedWorktrees.has(row.path) && (
                <WorktreeSessions
                  path={row.path}
                  entries={entriesByWorktree.get(row.path) ?? []}
                  customAgents={customAgents}
                  onSelectAgent={onSelectAgent}
                  onSelectChat={onSelectChat}
                  onCloseEntry={onCloseEntry}
                  onRenameEntry={onRenameEntry}
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
      {row.sessions > 0 && <span className="dshWorkspaceWorktreeSessions" title="Open chats here">{row.sessions}</span>}
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
  path, entries, customAgents, onSelectAgent, onSelectChat, onCloseEntry, onRenameEntry,
}: {
  readonly path: string
  readonly entries: readonly WorktreeSessionEntry[]
  readonly customAgents: readonly CustomAgent[]
  readonly onSelectAgent: (path: string, tileId: string) => void
  readonly onSelectChat: (path: string, id: string) => void
  /** Hover "x": removes an agent/terminal tab or hides a chat, from both this list and the tab strip at once. */
  readonly onCloseEntry: (path: string, entry: WorktreeSessionEntry) => void
  /** Rename in place (double-click the row): an agent/terminal tab or a chat session, reflected in the tab strip. */
  readonly onRenameEntry: (path: string, entry: WorktreeSessionEntry, title: string) => void
}) {
  const [editing, setEditing] = useState<{ readonly key: string; readonly value: string } | null>(null)
  const [showEarlier, setShowEarlier] = useState(false)
  if (entries.length === 0) {
    return <p className="dshWorkspaceSessionsEmpty">Nothing running here yet.</p>
  }
  const earlier = entries.filter(entry => entry.earlier === true).length
  const visible = showEarlier ? entries : entries.filter(entry => entry.earlier !== true)
  return (
    <ul className="dshWorkspaceSessions">
      {visible.length === 0 && <li className="dshWorkspaceSessionsEmpty">Nothing open here.</li>}
      {visible.map((entry) => {
        const key = `${entry.kind}-${entry.id}`
        const renaming = editing?.key === key
        const commit = (): void => {
          if (editing === null) return
          if (editing.value.trim() !== entry.label.trim()) onRenameEntry(path, entry, editing.value)
          setEditing(null)
        }
        const icon = entry.kind === 'agent'
          ? <AgentIcon commandId={entry.commandId ?? 'shell'} custom={customAgents.find(agent => agent.id === entry.commandId)?.badge} />
          : <ChatIcon />
        return (
        <li key={key} className="dshWorkspaceSessionItem">
          {renaming ? (
            <form className="dshWorkspaceSessionRow dshWorkspaceSessionRenameRow" onSubmit={(event) => { event.preventDefault(); commit() }}>
              {icon}
              <input
                className="dshWorkspaceSessionRename"
                aria-label={`Rename ${entry.label}`}
                autoFocus
                value={editing.value}
                onFocus={(event) => { event.currentTarget.select() }}
                onChange={(event) => { setEditing({ key, value: event.target.value }) }}
                onBlur={commit}
                onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null) } }}
              />
            </form>
          ) : (
          <button
            type="button"
            className="dshWorkspaceSessionRow"
            title={`${entry.label} (double-click to rename)`}
            aria-pressed={entry.active === true}
            onClick={() => { if (entry.kind === 'agent') onSelectAgent(path, entry.id); else onSelectChat(path, entry.id) }}
            onDoubleClick={() => { setEditing({ key, value: entry.label }) }}
          >
            {icon}
            <span className="dshWorkspaceSessionLabel">{entry.label}</span>
            {entry.running === true && <span className="dshWorkspaceDot" data-dot="running" role="img" aria-label="Running" />}
          </button>
          )}
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
        )
      })}
      {earlier > 0 && (
        <li className="dshWorkspaceSessionItem">
          <button type="button" className="dshWorkspaceSessionRow dshWorkspaceSessionsMore" aria-expanded={showEarlier} onClick={() => { setShowEarlier(!showEarlier) }}>
            {showEarlier ? 'Hide earlier chats' : `${String(earlier)} earlier ${earlier === 1 ? 'chat' : 'chats'}`}
          </button>
        </li>
      )}
    </ul>
  )
}
