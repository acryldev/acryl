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

/** The one inline edit open at a time: the name being typed, or a delete awaiting confirmation. */
type Pending =
  | { readonly type: 'create'; readonly entry: 'file' | 'dir'; readonly value: string }
  | { readonly type: 'rename'; readonly file: string; readonly value: string }
  | { readonly type: 'delete'; readonly file: string; readonly isDir: boolean }

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
  const [pending, setPending] = useState<Pending | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
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
    setPending(null)
    setEditError(null)
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

  const submit = (): void => {
    if (path === undefined || pending === null) return
    const change = pending.type === 'create'
      ? { op: 'create', kind: pending.entry, file: pending.value.trim() } as const
      : pending.type === 'rename'
        ? { op: 'rename', file: pending.file, to: pending.value.trim() } as const
        : { op: 'delete', file: pending.file } as const
    if (change.op !== 'delete' && (change.op === 'create' ? change.file : change.to) === '') return
    filesApi.change(path, change).then(
      (done) => {
        setPending(null)
        setEditError(null)
        setReload(n => n + 1)
        if (change.op === 'create' && change.kind === 'file' && done.file !== null) shell.openFile({ worktree: path, file: done.file })
      },
      (cause: unknown) => { setEditError(cause instanceof Error ? cause.message : 'That change failed.') },
    )
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
        <button type="button" className="dshWorkspaceChangesRefresh" aria-label="New file" title="New file" onClick={() => { setEditError(null); setPending({ type: 'create', entry: 'file', value: '' }) }}>+</button>
        <button type="button" className="dshWorkspaceChangesRefresh" aria-label="New folder" title="New folder" onClick={() => { setEditError(null); setPending({ type: 'create', entry: 'dir', value: '' }) }}>▣</button>
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
      {pending !== null && (
        <form className="dshWorkspaceFilesEdit" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {pending.type === 'delete' ? (
            <span className="dshWorkspaceFilesEditText">Delete {pending.isDir ? 'empty folder' : 'file'} <strong>{pending.file}</strong>? This cannot be undone here.</span>
          ) : (
            <input
              autoFocus
              aria-label={pending.type === 'create' ? (pending.entry === 'file' ? 'New file path' : 'New folder path') : 'New path'}
              placeholder={pending.type === 'create' ? 'path/relative/to/the/worktree' : 'new path'}
              value={pending.value}
              onChange={(event) => { setPending({ ...pending, value: event.target.value }) }}
            />
          )}
          <button type="submit">{pending.type === 'delete' ? 'Delete' : pending.type === 'rename' ? 'Rename' : 'Create'}</button>
          <button type="button" onClick={() => { setPending(null); setEditError(null) }}>Cancel</button>
        </form>
      )}
      {editError !== null && <p className="dshWorkspaceChangesError" role="alert">{editError}</p>}
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
            <button type="button" className="dshWorkspaceFilePreview" aria-label={`Rename ${row.path}`} title="Rename or move" onClick={() => { setEditError(null); setPending({ type: 'rename', file: row.path, value: row.path }) }}>Rename</button>
            <button type="button" className="dshWorkspaceFilePreview" aria-label={`Delete ${row.path}`} title="Delete" onClick={() => { setEditError(null); setPending({ type: 'delete', file: row.path, isDir: row.kind === 'dir' }) }}>Delete</button>
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
