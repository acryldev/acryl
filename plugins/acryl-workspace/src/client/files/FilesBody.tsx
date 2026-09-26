/** Right pane tab: the selected worktree's files as a lazy tree. Clicking a file opens it in the editor. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { WorkspaceFilesApi } from './files-api.ts'
import { visibleRows, type DirState } from './tree-model.ts'

export type FilesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly filesApi: WorkspaceFilesApi
}

const ROOT = ''

export function FilesBody({ shell, filesApi }: FilesBodyProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const worktree = shell.selectedWorktree()
  const path = worktree?.path
  const [dirs, setDirs] = useState<ReadonlyMap<string, DirState>>(new Map())
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [reload, setReload] = useState(0)

  const load = useCallback((root: string, dir: string, isCurrent: () => boolean): void => {
    setDirs(previous => new Map(previous).set(dir, { phase: 'loading' }))
    filesApi.tree(root, dir).then(
      (view) => { if (isCurrent()) setDirs(previous => new Map(previous).set(dir, { phase: 'ready', entries: view.entries, truncated: view.truncated })) },
      (cause: unknown) => { if (isCurrent()) setDirs(previous => new Map(previous).set(dir, { phase: 'error', message: cause instanceof Error ? cause.message : 'Could not read the folder.' })) },
    )
  }, [filesApi])

  // A different worktree (or a manual reload) starts a fresh tree from its root.
  useEffect(() => {
    if (path === undefined) return
    let current = true
    setDirs(new Map())
    setOpen(new Set())
    setFilter('')
    load(path, ROOT, () => current)
    return () => { current = false }
  }, [path, reload, load])

  const toggle = (dir: string): void => {
    if (path === undefined) return
    const isOpen = open.has(dir)
    setOpen((previous) => {
      const next = new Set(previous)
      if (isOpen) next.delete(dir)
      else next.add(dir)
      return next
    })
    if (!isOpen && dirs.get(dir)?.phase !== 'ready') load(path, dir, () => true)
  }

  const rows = useMemo(() => visibleRows(dirs, open, filter), [dirs, open, filter])
  const rootState = dirs.get(ROOT)

  if (worktree === undefined || path === undefined) {
    return (
      <div className="dshWorkspaceFiles" data-empty>
        <p className="dshWorkspaceChangesEmpty">Select a worktree in the Projects list to browse its files.</p>
      </div>
    )
  }

  return (
    <div className="dshWorkspaceFiles">
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{worktree.branch ?? 'detached'}</strong>
          <span className="dshWorkspaceChangesMeta">files</span>
        </div>
        <button type="button" className="dshWorkspaceChangesRefresh" aria-label="Reload files" title="Reload" onClick={() => { setReload(n => n + 1) }}>↻</button>
      </header>
      <input
        className="dshWorkspaceFilesFilter"
        type="search"
        aria-label="Filter files"
        placeholder="Filter opened folders by name"
        value={filter}
        onChange={(event) => { setFilter(event.target.value) }}
      />
      {rootState?.phase === 'loading' && <p className="dshWorkspaceChangesEmpty">Loading...</p>}
      {rootState?.phase === 'error' && <p className="dshWorkspaceChangesError" role="alert">{rootState.message}</p>}
      {rootState?.phase === 'ready' && rows.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">{filter.trim() === '' ? 'This folder is empty.' : 'No opened file matches.'}</p>
      )}
      <ul className="dshWorkspaceFileTree" role="tree">
        {rows.map(row => (
          <li key={row.path} role="none" className="dshWorkspaceFileItem">
            <button
              type="button"
              role="treeitem"
              aria-expanded={row.kind === 'dir' ? row.open : undefined}
              className="dshWorkspaceFileRow"
              style={{ paddingLeft: 8 + row.depth * 14 }}
              title={row.path}
              onClick={() => {
                if (row.kind === 'dir') toggle(row.path)
                else shell.openFile({ worktree: path, file: row.path })
              }}
            >
              <span className="dshWorkspaceFileGlyph" aria-hidden="true">{row.kind === 'dir' ? (row.open ? '▾' : '▸') : '·'}</span>
              <span className="dshWorkspaceFileName">{row.name}</span>
              {row.status === 'loading' && <span className="dshWorkspaceFileHint">loading</span>}
              {row.status === 'error' && <span className="dshWorkspaceFileHint" data-error>failed</span>}
            </button>
            {row.kind === 'file' && /\.(md|markdown|mdx)$/i.test(row.name) && (
              <button
                type="button"
                className="dshWorkspaceFilePreview"
                aria-label={`Preview ${row.path}`}
                title="Preview as a document"
                onClick={() => { shell.openDoc({ worktree: path, file: row.path }) }}
              >
                Preview
              </button>
            )}
            {row.kind === 'file' && /\.(md|markdown|mdx)$/i.test(row.name) && (
              <button
                type="button"
                className="dshWorkspaceFilePreview"
                aria-label={`Preview ${row.path}`}
                title="Preview as a document"
                onClick={() => { shell.openDoc({ worktree: path, file: row.path }) }}
              >
                Preview
              </button>
            )}
          </li>
        ))}
      </ul>
      {rootState?.phase === 'ready' && rootState.truncated && (
        <p className="dshWorkspaceChangesEmpty">Showing the first {rootState.entries.length} entries of the root.</p>
      )}
    </div>
  )
}
