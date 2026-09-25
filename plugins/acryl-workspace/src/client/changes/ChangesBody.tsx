/** Right pane tab: the selected worktree's changed files. Clicking one opens its diff in the canvas. */

import { useCallback, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitChange, GitChangeCode } from '../../git/contract.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export type ChangesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
}

const CODE_LABEL: Record<GitChangeCode, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  U: 'Unmerged',
  '?': 'Untracked',
}

/** @returns the directory part (with trailing slash) and file name of a repository path. */
export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? { dir: '', name: path } : { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

function branchTitle(branch: string | null, path: string): string {
  return branch ?? `${splitPath(path.replace(/\/+$/, '')).name} (detached)`
}

export function ChangesBody({ shell }: ChangesBodyProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const worktree = shell.selectedWorktree()

  if (worktree === undefined) {
    return (
      <div className="dshWorkspaceChanges" data-empty>
        <p className="dshWorkspaceChangesEmpty">
          Select a worktree in the Projects list to see its changes.
        </p>
      </div>
    )
  }

  const staged = worktree.changes.filter(change => change.staged).length
  return (
    <div className="dshWorkspaceChanges" data-selected={snapshot.selectedPath}>
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{branchTitle(worktree.branch, worktree.path)}</strong>
          <span className="dshWorkspaceChangesPath" title={worktree.path}>{worktree.path}</span>
          <span className="dshWorkspaceChangesMeta">
            {worktree.changes.length} changed{staged > 0 ? `, ${String(staged)} staged` : ''}
          </span>
        </div>
        <button
          type="button"
          className="dshWorkspaceChangesRefresh"
          aria-label="Refresh changes"
          title="Refresh"
          onClick={() => { void shell.refreshStatus(worktree.path) }}
        >
          ↻
        </button>
      </header>
      {worktree.phase === 'error' && (
        <p className="dshWorkspaceChangesError" role="alert">{worktree.error ?? 'Could not read git status.'}</p>
      )}
      {worktree.phase === 'ready' && worktree.changes.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">Working tree clean.</p>
      )}
      {(worktree.phase === 'idle' || worktree.phase === 'loading') && worktree.changes.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">Loading...</p>
      )}
      <ul className="dshWorkspaceChangeList">
        {worktree.changes.map(change => (
          <li key={change.path}>
            <ChangeRow
              change={change}
              onOpen={() => { shell.openDiff({ worktree: worktree.path, file: change.path }) }}
            />
          </li>
        ))}
      </ul>
      {worktree.truncated && (
        <p className="dshWorkspaceChangesEmpty">Showing the first {worktree.changes.length} changes.</p>
      )}
    </div>
  )
}

function ChangeRow({ change, onOpen }: { change: GitChange; onOpen: () => void }) {
  const { dir, name } = splitPath(change.path)
  return (
    <button type="button" className="dshWorkspaceChange" title={change.path} onClick={onOpen}>
      <span className="dshWorkspaceChangeCode" data-code={change.code} title={CODE_LABEL[change.code]}>
        {change.code}
      </span>
      <span className="dshWorkspaceChangePath">
        <span className="dshWorkspaceChangeName">{name}</span>
        {dir !== '' && <span className="dshWorkspaceChangeDir">{dir}</span>}
      </span>
      {change.staged && <span className="dshWorkspaceChangeStaged" title="Staged">S</span>}
      {(change.added ?? 0) + (change.removed ?? 0) > 0 && (
        <span className="dshWorkspaceChangeStat">
          <span data-kind="add">+{change.added ?? 0}</span> <span data-kind="remove">-{change.removed ?? 0}</span>
        </span>
      )}
    </button>
  )
}
