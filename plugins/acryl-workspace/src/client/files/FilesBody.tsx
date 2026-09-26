/** Right pane tab: the selected worktree's files as a lazy tree. Clicking a file opens it in the editor. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { GitSearchMode, GitSearchView } from '../../git/contract.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceFilesApi } from './files-api.ts'
import { visibleRows, type DirState } from './tree-model.ts'

export type FilesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly filesApi: WorkspaceFilesApi
  readonly gitApi: WorkspaceGitApi
}

type SearchState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly view: GitSearchView }
  | { readonly phase: 'error'; readonly message: string }

const SEARCH_DELAY_MS = 250

const ROOT = ''

export function FilesBody({ shell, filesApi, gitApi }: FilesBodyProps) {
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  useSyncExternalStore(subscribe, () => shell.getSnapshot())
  const worktree = shell.selectedWorktree()
  const path = worktree?.path
  const [dirs, setDirs] = useState<ReadonlyMap<string, DirState>>(new Map())
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<GitSearchMode>('name')
  const [search, setSearch] = useState<SearchState>({ phase: 'idle' })

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
    setQuery('')
    load(path, ROOT, () => current)
    return () => { current = false }
  }, [path, reload, load])

  // Debounced repo-wide search; a newer query or another worktree discards the older answer.
  useEffect(() => {
    if (path === undefined || query.trim() === '') {
      setSearch({ phase: 'idle' })
      return
    }
    let current = true
    setSearch({ phase: 'loading' })
    const timer = setTimeout(() => {
      gitApi.search(path, query, mode).then(
        (view) => { if (current) setSearch({ phase: 'ready', view }) },
        (cause: unknown) => { if (current) setSearch({ phase: 'error', message: cause instanceof Error ? cause.message : 'Search failed.' }) },
      )
    }, SEARCH_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [gitApi, path, query, mode])

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
      <div className="dshWorkspaceFilesSearch">
        <input
          className="dshWorkspaceFilesFilter"
          type="search"
          aria-label="Search the repository"
          placeholder={mode === 'name' ? 'Find a file by name' : 'Find text in files'}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <div className="dshWorkspaceFilesSearchMode" role="group" aria-label="Search in">
          {(['name', 'content'] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m) }}>{m === 'name' ? 'Names' : 'Content'}</button>
          ))}
        </div>
      </div>
      {search.phase !== 'idle' ? (
        <div className="dshWorkspaceFilesResults">
          {search.phase === 'loading' && <p className="dshWorkspaceChangesEmpty">Searching...</p>}
          {search.phase === 'error' && <p className="dshWorkspaceChangesError" role="alert">{search.message}</p>}
          {search.phase === 'ready' && search.view.hits.length === 0 && <p className="dshWorkspaceChangesEmpty">Nothing found.</p>}
          {search.phase === 'ready' && (
            <ul className="dshWorkspaceSearchHits" aria-label="Search results">
              {search.view.hits.map(hit => (
                <li key={`${hit.file}:${String(hit.line ?? 0)}`}>
                  <button type="button" className="dshWorkspaceSearchHit" title={hit.file} onClick={() => { shell.openFile({ worktree: path, file: hit.file }) }}>
                    <span className="dshWorkspaceSearchFile">{hit.file}{hit.line === undefined ? '' : `:${String(hit.line)}`}</span>
                    {hit.text !== undefined && <span className="dshWorkspaceSearchText">{hit.text.trim()}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.phase === 'ready' && search.view.truncated && <p className="dshWorkspaceChangesEmpty">Showing the first {search.view.hits.length} matches. Narrow the search.</p>}
        </div>
      ) : (
        <>
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
          </li>
        ))}
      </ul>
      {rootState?.phase === 'ready' && rootState.truncated && (
        <p className="dshWorkspaceChangesEmpty">Showing the first {rootState.entries.length} entries of the root.</p>
      )}
        </>
      )}
    </div>
  )
}
