/** Right pane tab: the selected worktree's package scripts, each runnable in a terminal tab of that worktree. */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { checkCommandLine, type GitChecksView } from '../../git/contract.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export type ChecksBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
}

type Loaded =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'ready'; readonly view: GitChecksView }

export function ChecksBody({ shell, gitApi }: ChecksBodyProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const worktree = shell.selectedWorktree()
  const path = worktree?.path
  const [loaded, setLoaded] = useState<Loaded>({ phase: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (path === undefined) return
    let cancelled = false
    setLoaded({ phase: 'loading' })
    gitApi.checks(path).then(
      (view) => { if (!cancelled) setLoaded({ phase: 'ready', view }) },
      (cause: unknown) => { if (!cancelled) setLoaded({ phase: 'error', message: cause instanceof Error ? cause.message : 'Could not read the scripts.' }) },
    )
    return () => { cancelled = true }
  }, [gitApi, path, reload])

  if (worktree === undefined || path === undefined) {
    return (
      <div className="dshWorkspaceChecks" data-empty>
        <p className="dshWorkspaceChangesEmpty">Select a worktree in the Projects list to see its checks.</p>
      </div>
    )
  }

  return (
    <div className="dshWorkspaceChecks">
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{worktree.branch ?? 'detached'}</strong>
          <span className="dshWorkspaceChangesMeta">
            {loaded.phase === 'ready' ? `runs with ${loaded.view.manager ?? 'npm'}` : 'package scripts'}
          </span>
        </div>
        <button type="button" className="dshWorkspaceChangesRefresh" aria-label="Reload scripts" title="Reload" onClick={() => { setReload(n => n + 1) }}>↻</button>
      </header>
      {loaded.phase === 'loading' && <p className="dshWorkspaceChangesEmpty">Loading...</p>}
      {loaded.phase === 'error' && <p className="dshWorkspaceChangesError" role="alert">{loaded.message}</p>}
      {loaded.phase === 'ready' && loaded.view.scripts.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">No package.json scripts in this worktree.</p>
      )}
      {loaded.phase === 'ready' && (
        <ul className="dshWorkspaceCheckList">
          {loaded.view.scripts.map((script) => {
            const line = checkCommandLine(loaded.view.manager, script.name)
            return (
              <li key={script.name} className="dshWorkspaceCheck" data-primary={script.primary || undefined}>
                <div className="dshWorkspaceCheckText">
                  <span className="dshWorkspaceCheckName">{script.name}</span>
                  <code className="dshWorkspaceCheckCommand" title={script.command}>{script.command}</code>
                </div>
                <button
                  type="button"
                  className="dshWorkspaceCheckRun"
                  aria-label={`Run ${line}`}
                  title={`Run ${line} in a terminal tab`}
                  onClick={() => { shell.runCheck({ worktree: path, title: line, commandLine: line }) }}
                >
                  Run
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
