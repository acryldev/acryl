/** Right pane tab: the selected worktree's changed files. Clicking one opens its diff in the canvas. */

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitChange, GitChangeCode } from '../../git/contract.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export type ChangesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
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

type Outcome = { readonly kind: 'error' | 'ok'; readonly text: string } | null

export function ChangesBody({ shell, gitApi }: ChangesBodyProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const snapshot = useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const worktree = shell.selectedWorktree()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

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
  const unstaged = worktree.changes.length - staged

  /** Run one git write, then refresh the status the rest of the shell shows; a failure is shown, not thrown. */
  const act = async (run: () => Promise<string | null>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setOutcome(null)
    try {
      const done = await run()
      if (done !== null) setOutcome({ kind: 'ok', text: done })
    } catch (cause) {
      setOutcome({ kind: 'error', text: cause instanceof Error ? cause.message : 'The git command failed.' })
    } finally {
      await shell.refreshStatus(worktree.path)
      setBusy(false)
    }
  }
  const setStaged = (files: readonly string[], on: boolean): Promise<void> => act(async () => {
    await (on ? gitApi.stage(worktree.path, files) : gitApi.unstage(worktree.path, files))
    return null
  })
  const commit = (): Promise<void> => act(async () => {
    const result = await gitApi.commit(worktree.path, message)
    setMessage('')
    return `Committed ${result.hash}: ${result.subject}`
  })
  const canCommit = staged > 0 && message.trim() !== '' && !busy
  return (
    <div className="dshWorkspaceChanges" data-selected={snapshot.selectedPath}>
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{branchTitle(worktree.branch, worktree.path)}</strong>
          <span className="dshWorkspaceChangesPath" title={worktree.path}>{worktree.path}</span>
          <span className="dshWorkspaceChangesMeta">
            {worktree.changes.length} changed{staged > 0 ? `, ${String(staged)} staged` : ''}
          </span>
          {worktree.added + worktree.removed > 0 && (
            <span className="dshWorkspaceChangesTotals" title="Lines added and removed across all changes">
              <span data-kind="add">+{worktree.added}</span> <span data-kind="remove">-{worktree.removed}</span>
            </span>
          )}
        </div>
        {worktree.changes.length > 0 && (
          <button
            type="button"
            className="dshWorkspaceChangesAll"
            disabled={busy}
            onClick={() => { void setStaged(worktree.changes.filter(change => change.staged !== (unstaged > 0)).map(change => change.path), unstaged > 0) }}
          >
            {unstaged > 0 ? 'Stage all' : 'Unstage all'}
          </button>
        )}
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
          <li key={change.path} className="dshWorkspaceChangeItem">
            <button
              type="button"
              className="dshWorkspaceChangeStage"
              disabled={busy}
              aria-label={`${change.staged ? 'Unstage' : 'Stage'} ${change.path}`}
              title={change.staged ? 'Unstage' : 'Stage'}
              onClick={() => { void setStaged([change.path], !change.staged) }}
            >
              {change.staged ? '\u2212' : '+'}
            </button>
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
      <form
        className="dshWorkspaceCommit"
        onSubmit={(event) => { event.preventDefault(); if (canCommit) void commit() }}
      >
        <textarea
          aria-label="Commit message"
          placeholder={staged > 0 ? 'Commit message (Cmd/Ctrl+Enter to commit)' : 'Stage files to commit them'}
          rows={3}
          value={message}
          onChange={(event) => { setMessage(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canCommit) {
              event.preventDefault()
              void commit()
            }
          }}
        />
        <button type="submit" className="dshWorkspaceCommitButton" disabled={!canCommit}>
          {busy ? 'Working...' : staged > 0 ? `Commit ${String(staged)} staged file${staged === 1 ? '' : 's'}` : 'Commit'}
        </button>
        {outcome?.kind === 'error' && <p className="dshWorkspaceChangesError" role="alert">{outcome.text}</p>}
        {outcome?.kind === 'ok' && <p className="dshWorkspaceCommitOk" role="status">{outcome.text}</p>}
      </form>
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
