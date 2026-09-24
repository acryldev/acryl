/** Diff tile, git mode: one changed file's unified diff against HEAD, with line numbers. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { GitDiffView } from '../../workspace-git-contract.ts'
import type { WorkspaceGitApi } from './git-api.ts'
import type { WorkspaceShellState } from './shell-state.ts'
import type { WorkspaceTile } from './state.ts'
import { parseUnifiedDiff } from './unified-diff.ts'

/** Rendering beyond this many rows is cut, so one huge diff cannot freeze the window. */
export const MAX_RENDERED_ROWS = 5000

type Load =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly view: GitDiffView }
  | { readonly phase: 'error'; readonly message: string }

/**
 * A primitive fingerprint of how git currently sees one file (status letter, staged flag, line
 * counts). When it moves, the shown diff is stale and is fetched again.
 */
export function changeSignature(shell: WorkspaceShellState, worktree: string, file: string): string {
  for (const repo of shell.getSnapshot().repos) {
    const found = repo.worktrees.find(entry => entry.path === worktree)
    if (found === undefined) continue
    const change = found.changes.find(entry => entry.path === file)
    return change === undefined
      ? 'none'
      : `${change.code}:${String(change.staged)}:${String(change.added)}:${String(change.removed)}`
  }
  return 'unknown'
}

export interface GitDiffPaneProps {
  readonly tile: WorkspaceTile
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
}

export function GitDiffPane({ tile, shell, gitApi }: GitDiffPaneProps) {
  const worktree = tile.diffWorktree ?? ''
  const file = tile.diffFile ?? ''
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const signature = useSyncExternalStore(subscribe, () => changeSignature(shell, worktree, file))
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Keep showing the previous diff while a refresh is in flight so the view does not flicker.
    setLoad(previous => previous.phase === 'ready' ? previous : { phase: 'loading' })
    gitApi.diff(worktree, file).then((view) => {
      if (!cancelled) setLoad({ phase: 'ready', view })
    }, (cause: unknown) => {
      if (!cancelled) setLoad({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    })
    return () => { cancelled = true }
  }, [gitApi, worktree, file, signature, reloads])

  const rows = useMemo(() => load.phase === 'ready' ? parseUnifiedDiff(load.view.text) : [], [load])
  const shown = rows.length > MAX_RENDERED_ROWS ? rows.slice(0, MAX_RENDERED_ROWS) : rows
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === 'add') added += 1
    else if (row.kind === 'remove') removed += 1
  }

  return (
    <div className="dshWorkspaceGitDiff" data-diff-file={file}>
      <div className="dshWorkspaceGitDiffBar">
        <span className="dshWorkspaceGitDiffFile" title={`${worktree}/${file}`}>{file}</span>
        {load.phase === 'ready' && !load.view.binary && (
          <span className="dshWorkspaceGitDiffCounts">
            <span data-kind="add">+{added}</span> <span data-kind="remove">-{removed}</span>
          </span>
        )}
        <button
          type="button"
          className="dshWorkspaceGitDiffRefresh"
          aria-label="Refresh diff"
          title="Refresh"
          onClick={() => { setReloads(count => count + 1) }}
        >
          ↻
        </button>
      </div>
      <div className="dshWorkspaceGitDiffBody" role="region" aria-label="Diff result">
        {load.phase === 'loading' && <p className="dshWorkspaceGitDiffNote">Loading diff...</p>}
        {load.phase === 'error' && <p className="dshWorkspaceGitDiffNote" data-tone="error" role="alert">{load.message}</p>}
        {load.phase === 'ready' && load.view.binary && <p className="dshWorkspaceGitDiffNote">Binary file - no text diff.</p>}
        {load.phase === 'ready' && !load.view.binary && rows.length === 0 && (
          <p className="dshWorkspaceGitDiffNote">No differences against HEAD.</p>
        )}
        {shown.map((row, index) => (
          row.kind === 'meta'
            ? null
            : (
                <div key={index} className="dshWorkspaceGitDiffLine" data-kind={row.kind}>
                  <span className="dshWorkspaceGitDiffNo">{row.oldNo ?? ''}</span>
                  <span className="dshWorkspaceGitDiffNo">{row.newNo ?? ''}</span>
                  <span className="dshWorkspaceGitDiffMarker">
                    {row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : row.kind === 'hunk' ? '' : ' '}
                  </span>
                  <span className="dshWorkspaceGitDiffText">{row.text}</span>
                </div>
              )
        ))}
        {rows.length > MAX_RENDERED_ROWS && (
          <p className="dshWorkspaceGitDiffNote">Showing the first {MAX_RENDERED_ROWS} of {rows.length} lines.</p>
        )}
        {load.phase === 'ready' && load.view.truncated && (
          <p className="dshWorkspaceGitDiffNote">The diff was cut at the size limit.</p>
        )}
      </div>
    </div>
  )
}
