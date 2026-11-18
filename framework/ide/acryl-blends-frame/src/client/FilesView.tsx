/**
 * The Files tab: a fuzzy search over every file of the app (⌘P anywhere), then the folder tree. A file opens as its own tab. Ignored files (build
 * output, dependencies) are left out of both, as in the mockup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileEntry, WorkspaceFilesApi } from 'acryl-workspace/ui'
import { displayMatch, fuzzySearch } from './fuzzy.ts'

/** The window event ⌘P sends: the Files tab is shown and its search takes the keys. */
export const FILES_SEARCH_EVENT = 'acryl-blends:files-search'

/** How many files the search reads before it stops walking; an app is far smaller. */
const MAX_INDEXED_FILES = 5000

export interface FilesViewProps {
  readonly files: WorkspaceFilesApi
  readonly root: string
  /** The file open as a tab, if any: its folders are expanded and its row marked. */
  readonly current?: string | undefined
  readonly openFile: (path: string) => void
}

const shown = (entry: FileEntry): boolean => entry.ignored !== true && entry.name !== '.git'
const join = (dir: string, name: string): string => (dir === '' ? name : `${dir}/${name}`)

/** Every shown file, one folder level at a time with the level's folders read together. A folder that cannot be read is skipped. */
async function indexFiles(files: WorkspaceFilesApi, root: string): Promise<string[]> {
  const found: string[] = []
  let level = ['']
  while (level.length > 0 && found.length < MAX_INDEXED_FILES) {
    const views = await Promise.all(level.map(dir => files.tree(root, dir).then(view => ({ dir, entries: view.entries }), () => ({ dir, entries: [] }))))
    level = []
    for (const { dir, entries } of views) {
      for (const entry of entries.filter(shown)) {
        if (entry.kind === 'dir') level.push(join(dir, entry.name))
        else found.push(join(dir, entry.name))
      }
    }
  }
  return found
}

/** The folders above a file, outermost first: `src/a/b.ts` gives `src`, `src/a`. */
export function foldersAbove(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, at) => parts.slice(0, at + 1).join('/'))
}

export function FilesView({ files, root, current, openFile }: FilesViewProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [index, setIndex] = useState<readonly string[] | undefined>(undefined)
  const [dirs, setDirs] = useState<ReadonlyMap<string, readonly FileEntry[]>>(new Map())
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(current === undefined ? [] : foldersAbove(current)))
  const [error, setError] = useState<string | undefined>(undefined)
  const search = useRef<HTMLInputElement>(null)

  const readDir = useCallback(async (dir: string) => {
    try {
      const view = await files.tree(root, dir)
      setDirs(current => new Map(current).set(dir, view.entries.filter(shown)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The folder could not be read.')
    }
  }, [files, root])

  useEffect(() => {
    void readDir('')
    for (const dir of open) void readDir(dir)
    let live = true
    indexFiles(files, root).then((found) => { if (live) setIndex(found) }, () => {})
    return () => { live = false }
  }, [files, root, readDir])

  useEffect(() => {
    const focus = () => { search.current?.focus(); search.current?.select() }
    window.addEventListener(FILES_SEARCH_EVENT, focus)
    focus()
    return () => { window.removeEventListener(FILES_SEARCH_EVENT, focus) }
  }, [])

  const matches = useMemo(() => fuzzySearch(query, index ?? [], 8), [query, index])
  useEffect(() => { setSelected(0) }, [query])

  const toggle = (dir: string) => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        if (!dirs.has(dir)) void readDir(dir)
      }
      return next
    })
  }

  const rows = (dir: string, depth: number): JSX.Element[] => (dirs.get(dir) ?? []).flatMap((entry) => {
    const path = join(dir, entry.name)
    const indent = { paddingLeft: `${String(8 + depth * 16)}px` }
    if (entry.kind === 'dir') {
      const expanded = open.has(path)
      return [
        <button key={path} type="button" className="acrylBlendsFrow" style={indent} aria-expanded={expanded} onClick={() => { toggle(path) }}>
          {expanded ? '▾' : '▸'} {entry.name}
        </button>,
        ...(expanded ? rows(path, depth + 1) : []),
      ]
    }
    return [
      <button key={path} type="button" className="acrylBlendsFrow" style={indent} aria-current={path === current || undefined} onClick={() => { openFile(path) }}>{entry.name}</button>,
    ]
  })

  return (
    <div className="acrylBlendsFiles">
      <label className="acrylBlendsFsearch">
        <input
          ref={search}
          aria-label="Search files"
          placeholder="Search files"
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(value => Math.min(value + 1, matches.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => Math.max(value - 1, 0)) }
            if (event.key === 'Enter' && matches[selected] !== undefined) openFile(matches[selected].path)
            if (event.key === 'Escape') setQuery('')
          }}
        />
        <kbd>⌘P</kbd>
      </label>
      {query.trim() !== '' && (
        <div className="acrylBlendsFres">
          {matches.length === 0 && <p className="acrylBlendsNote">{index === undefined ? 'Reading the files…' : 'No file matches.'}</p>}
          {matches.map((match, position) => {
            const display = displayMatch(match)
            return (
              <button
                key={match.path}
                type="button"
                className="acrylBlendsFrow"
                aria-selected={position === selected}
                title={match.path}
                onMouseEnter={() => { setSelected(position) }}
                onClick={() => { openFile(match.path) }}
              >
                <span className="acrylBlendsFrowName">{display.parts.map((part, at) => (part.hit ? <b key={at}>{part.text}</b> : part.text))}</span>
                <span className="acrylBlendsMeta">{display.folder}</span>
              </button>
            )
          })}
        </div>
      )}
      {error !== undefined && <p className="acrylBlendsNote" data-error>{error}</p>}
      {rows('', 0)}
      <p className="acrylBlendsHint">Type to fuzzy-search every file (⌘P anywhere). Click a file to open it as a tab.</p>
    </div>
  )
}
