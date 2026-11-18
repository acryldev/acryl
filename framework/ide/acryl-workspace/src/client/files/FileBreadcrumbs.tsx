/**
 * The open file's path above the editor, every part clickable: a folder lists what it holds, the file lists the folder it is in. In the
 * list a folder opens in place (".." goes up), so the whole project can be walked without leaving the editor; a file opens in its tab.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { FileEntry } from '../../files/contract.ts'
import { joinPath } from './tree-model.ts'
import { crumbsFor, foldCount, parentDir } from './breadcrumbs.ts'
import type { WorkspaceFilesApi } from './files-api.ts'

export interface FileBreadcrumbsProps {
  readonly worktree: string
  readonly file: string
  readonly filesApi: Pick<WorkspaceFilesApi, 'tree'>
  /** Open a file of the same worktree, by its path relative to it. */
  readonly onOpenFile: (file: string) => void
  /** Appended to the file's part, for example an unsaved marker. */
  readonly suffix?: string
}

type Listing =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'ready'; readonly entries: readonly FileEntry[] }

/** What the open list shows: which folder, under which part of the path (`FOLDED` for the "..." part). */
interface Open {
  readonly crumb: number
  readonly dir: string
}

const FOLDED = -1

export function FileBreadcrumbs({ worktree, file, filesApi, onOpenFile, suffix = '' }: FileBreadcrumbsProps) {
  const crumbs = crumbsFor(worktree, file)
  const [open, setOpen] = useState<Open | null>(null)
  const [listing, setListing] = useState<Listing>({ phase: 'loading' })
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const path = useRef<HTMLElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  // How many leading parts fold into "...", from the parts' measured widths (an invisible copy of the whole path) and the room there is,
  // again whenever either changes size (the pane, or the text once its font has loaded).
  const [folded, setFolded] = useState(0)
  const parts = crumbs.map(crumb => crumb.label).join('/') + suffix
  useLayoutEffect(() => {
    const nav = path.current
    const copy = measure.current
    if (nav === null || copy === null) return
    const fit = (): void => {
      const widths = [...copy.children].map(child => child.getBoundingClientRect().width)
      const ellipsis = widths.pop() ?? 0
      setFolded(foldCount(widths, ellipsis, nav.clientWidth))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(nav)
    observer.observe(copy)
    return () => { observer.disconnect() }
  }, [parts])

  useEffect(() => {
    if (open === null) return
    let current = true
    setListing({ phase: 'loading' })
    setActive(0)
    filesApi.tree(worktree, open.dir).then(
      (view) => { if (current) setListing({ phase: 'ready', entries: view.entries }) },
      (cause: unknown) => { if (current) setListing({ phase: 'error', message: cause instanceof Error ? cause.message : 'Could not read the folder.' }) },
    )
    return () => { current = false }
  }, [filesApi, worktree, open])

  // A press anywhere else closes the list.
  useEffect(() => {
    if (open === null) return
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true) setOpen(null)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => { document.removeEventListener('pointerdown', outside, true) }
  }, [open])

  // Keep the active row in view by scrolling the list alone: `scrollIntoView` would also scroll every pane around it sideways.
  useEffect(() => {
    const box = list.current
    const row = box?.querySelector<HTMLElement>('[data-active]')
    if (box === null || box === undefined || row === null || row === undefined) return
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight
  }, [active, listing])
  // The list takes the keys while it is open (arrows, Enter, Escape), again after each folder change replaces its rows.
  useEffect(() => { if (open !== null) list.current?.focus({ preventScroll: true }) }, [open])

  // A different file (one opened from the list, or another tab) starts closed.
  useEffect(() => { setOpen(null) }, [worktree, file])

  const up = open === null ? undefined : parentDir(open.dir)
  const entries = listing.phase === 'ready' ? listing.entries : []
  const rows: { readonly key: string, readonly label: string, readonly kind: 'up' | 'dir' | 'file', readonly path: string }[] = [
    ...(up === undefined ? [] : [{ key: '..', label: '..', kind: 'up' as const, path: up }]),
    ...entries.map(entry => ({ key: entry.name, label: entry.name, kind: entry.kind === 'dir' ? 'dir' as const : 'file' as const, path: joinPath(open?.dir ?? '', entry.name) })),
  ]

  const choose = (row: (typeof rows)[number]): void => {
    if (open === null) return
    if (row.kind === 'file') { setOpen(null); onOpenFile(row.path); return }
    setOpen({ crumb: open.crumb, dir: row.path })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (open === null) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(null); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, rows.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    if (event.key === 'ArrowLeft' && up !== undefined) { event.preventDefault(); setOpen({ crumb: open.crumb, dir: up }) }
    if (event.key === 'Enter' || (event.key === 'ArrowRight' && rows[active]?.kind === 'dir')) {
      const row = rows[active]
      if (row !== undefined) { event.preventDefault(); choose(row) }
    }
  }

  return (
    <div ref={root} className="dshWorkspaceCrumbs" onKeyDown={onKeyDown}>
      <nav ref={path} aria-label="File path" className="dshWorkspaceCrumbsPath" data-tight={folded >= crumbs.length - 1 ? '' : undefined} title={`${worktree}/${file}`}>
        {folded > 0 && (
          <span className="dshWorkspaceCrumbsPart">
            <button
              type="button"
              className="dshWorkspaceCrumb"
              aria-label={`Folders above: ${crumbs.slice(0, folded).map(crumb => crumb.label).join(' / ')}`}
              aria-haspopup="listbox"
              aria-expanded={open?.crumb === FOLDED}
              onClick={() => { setOpen(open?.crumb === FOLDED ? null : { crumb: FOLDED, dir: crumbs[folded - 1]?.dir ?? '' }) }}
            >
              ...
            </button>
          </span>
        )}
        {crumbs.map((crumb, index) => index < folded ? null : (
          <span key={`${String(index)}:${crumb.label}`} className="dshWorkspaceCrumbsPart">
            {index > 0 && <span className="dshWorkspaceCrumbsSeparator" aria-hidden="true">›</span>}
            <button
              type="button"
              className="dshWorkspaceCrumb"
              data-file={crumb.file ? '' : undefined}
              aria-haspopup="listbox"
              aria-expanded={open?.crumb === index}
              aria-current={crumb.file ? 'page' : undefined}
              onClick={() => { setOpen(open?.crumb === index ? null : { crumb: index, dir: crumb.dir }) }}
            >
              {crumb.label}{crumb.file ? suffix : ''}
            </button>
          </span>
        ))}
      </nav>
      <div ref={measure} className="dshWorkspaceCrumbsMeasure" aria-hidden="true">
        {crumbs.map((crumb, index) => (
          <span key={`${String(index)}:${crumb.label}`} className="dshWorkspaceCrumbsPart">
            {index > 0 && <span className="dshWorkspaceCrumbsSeparator">›</span>}
            <span className="dshWorkspaceCrumb" data-file={crumb.file ? '' : undefined}>{crumb.label}{crumb.file ? suffix : ''}</span>
          </span>
        ))}
        <span className="dshWorkspaceCrumbsPart"><span className="dshWorkspaceCrumb">...</span></span>
      </div>
      {open !== null && (
        <div ref={list} className="dshWorkspaceCrumbsList" role="listbox" aria-label={open.dir === '' ? crumbs[0]?.label : open.dir} tabIndex={-1}>
          <div className="dshWorkspaceCrumbsListHead">{open.dir === '' ? crumbs[0]?.label : open.dir}</div>
          {listing.phase === 'loading' && <div className="dshWorkspaceCrumbsNote">Opening...</div>}
          {listing.phase === 'error' && <div className="dshWorkspaceCrumbsNote" role="alert">{listing.message}</div>}
          {listing.phase === 'ready' && rows.length === 0 && <div className="dshWorkspaceCrumbsNote">This folder is empty.</div>}
          {rows.map((row, index) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={row.kind === 'file' && row.path === file}
              title={row.label}
              className="dshWorkspaceCrumbsItem"
              data-kind={row.kind}
              data-active={index === active ? '' : undefined}
              onMouseEnter={() => { setActive(index) }}
              tabIndex={-1}
              onClick={() => { choose(row) }}
            >
              <EntryIcon kind={row.kind} />
              <span className="dshWorkspaceCrumbsName">{row.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EntryIcon({ kind }: { readonly kind: 'up' | 'dir' | 'file' }) {
  const path = kind === 'file'
    ? 'M4 1.5h5l3 3v10H4z M9 1.5v3h3'
    : kind === 'dir' ? 'M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z' : 'M8 13V3 M3.5 7.5L8 3l4.5 4.5'
  return (
    <svg className="dshWorkspaceCrumbsIcon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}
