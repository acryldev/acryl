/**
 * The Files tab's tree: only the rows in view are drawn, so an opened `node_modules` scrolls as smoothly as a small folder. Folders open
 * with a click, the arrow keys or Enter; a file opens as a tab. A row's actions (open beside, preview, copy its path, new file here,
 * rename, delete) are in its menu: right-click, the "..." button on the row under the pointer, or Shift+F10 / the context-menu key.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronIcon, FileIcon, FolderIcon, MoreIcon } from './file-icons.tsx'
import { moveFor, parentOf, rowWindow, scrollToShow, type TreeRow } from './tree-model.ts'

/** Each row's height in px; the drawing window is computed from it, so it matches `.dshWorkspaceFileRow`'s height. */
export const FILE_ROW_HEIGHT = 24
const INDENT = 12

export interface FileTreeActions {
  toggle(path: string): void
  open(path: string, options?: { readonly beside?: boolean }): void
  preview(path: string): void
  createIn(dir: string, entry: 'file' | 'dir'): void
  rename(row: TreeRow): void
  remove(row: TreeRow): void
}

export interface FileTreeProps {
  readonly rows: readonly TreeRow[]
  /** Absolute worktree path, for "Copy path". */
  readonly worktree: string
  readonly actions: FileTreeActions
}

interface Menu {
  readonly row: TreeRow
  readonly x: number
  readonly y: number
}

const isMarkdown = (name: string): boolean => /\.(md|markdown|mdx)$/i.test(name)

export function FileTree({ rows, worktree, actions }: FileTreeProps) {
  const box = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(0)
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  useLayoutEffect(() => {
    const node = box.current
    if (node === null) return
    setViewHeight(node.clientHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { setViewHeight(node.clientHeight) })
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [])

  const activeIndex = active === null ? -1 : rows.findIndex(row => row.path === active)
  // The keyboard's row stays in view: scrolling the box alone, never the panes around it.
  useEffect(() => {
    const node = box.current
    if (node === null || activeIndex < 0) return
    const next = scrollToShow(activeIndex, FILE_ROW_HEIGHT, node.scrollTop, node.clientHeight)
    if (next !== node.scrollTop) node.scrollTop = next
  }, [activeIndex])

  const { first, last } = rowWindow(rows.length, FILE_ROW_HEIGHT, scrollTop, viewHeight)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const row = rows[activeIndex]
      const node = box.current
      if (row === undefined || node === null) return
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      setMenu({ row, x: rect.left + 24 + row.depth * INDENT, y: rect.top + (activeIndex + 1) * FILE_ROW_HEIGHT - node.scrollTop })
      return
    }
    const move = moveFor(event.key, rows, Math.max(activeIndex, 0))
    if (move.kind === 'none') return
    event.preventDefault()
    if (move.kind === 'focus') setActive(rows[move.index]?.path ?? null)
    else if (move.kind === 'toggle') actions.toggle(move.path)
    else actions.open(move.path)
  }

  const openMenu = (event: MouseEvent, row: TreeRow): void => {
    event.preventDefault()
    setActive(row.path)
    setMenu({ row, x: event.clientX, y: event.clientY })
  }

  return (
    <div
      ref={box}
      className="dshWorkspaceFileTreeScroll"
      onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop) }}
    >
      <div
        role="tree"
        aria-label="Files"
        tabIndex={0}
        className="dshWorkspaceFileTree"
        style={{ height: rows.length * FILE_ROW_HEIGHT }}
        aria-activedescendant={activeIndex >= 0 ? rowId(rows[activeIndex]?.path ?? '') : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => { if (active === null && rows[0] !== undefined) setActive(rows[0].path) }}
      >
        {rows.slice(first, last).map((row, offset) => (
          <div
            key={row.path}
            id={rowId(row.path)}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.kind === 'dir' ? row.open : undefined}
            aria-selected={row.path === active}
            aria-label={row.name}
            className="dshWorkspaceFileRow"
            data-ignored={row.ignored || undefined}
            data-active={row.path === active || undefined}
            style={{ top: (first + offset) * FILE_ROW_HEIGHT, paddingLeft: 6 + row.depth * INDENT }}
            title={row.path}
            onClick={() => {
              setActive(row.path)
              if (row.kind === 'dir') actions.toggle(row.path)
              else actions.open(row.path)
            }}
            onContextMenu={(event) => { openMenu(event, row) }}
          >
            {Array.from({ length: row.depth }, (_, level) => (
              <span key={level} className="dshWorkspaceFileGuide" aria-hidden="true" style={{ left: 12 + level * INDENT }} />
            ))}
            <span className="dshWorkspaceFileTwisty" aria-hidden="true">{row.kind === 'dir' && <ChevronIcon open={row.open} />}</span>
            <span className="dshWorkspaceFileIcon" aria-hidden="true">{row.kind === 'dir' ? <FolderIcon open={row.open} /> : <FileIcon name={row.name} />}</span>
            <span className="dshWorkspaceFileName">{row.name}</span>
            {row.status === 'loading' && <span className="dshWorkspaceFileHint">loading</span>}
            {row.status === 'error' && <span className="dshWorkspaceFileHint" data-error>failed</span>}
            <button
              type="button"
              className="dshWorkspaceFileMore"
              aria-label={`Actions for ${row.path}`}
              title="More actions"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setActive(row.path)
                setMenu({ row, x: rect.right - 200, y: rect.bottom + 2 })
              }}
            >
              <MoreIcon />
            </button>
          </div>
        ))}
      </div>
      {menu !== null && (
        <FileRowMenu
          menu={menu}
          worktree={worktree}
          actions={actions}
          onClose={() => { setMenu(null); box.current?.querySelector<HTMLElement>('[role=tree]')?.focus({ preventScroll: true }) }}
        />
      )}
    </div>
  )
}

function rowId(path: string): string {
  return `acryl-file-row-${encodeURIComponent(path)}`
}

function FileRowMenu({ menu, worktree, actions, onClose }: { readonly menu: Menu; readonly worktree: string; readonly actions: FileTreeActions; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: menu.x, y: menu.y })
  useEffect(() => {
    const away = (event: PointerEvent): void => { if (ref.current?.contains(event.target as Node) !== true) onClose() }
    const key = (event: globalThis.KeyboardEvent): void => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true) }
  }, [onClose])
  // Kept inside the window: a row near the bottom or the right edge opens its menu upward or leftward.
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    setPosition({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, menu.y + rect.height > window.innerHeight - 4 ? menu.y - rect.height : menu.y),
    })
    node.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [menu])
  const { row } = menu
  const dir = row.kind === 'dir' ? row.path : parentOf(row.path)
  const item = (label: string, run: () => void) => (
    <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { onClose(); run() }}>{label}</button>
  )
  const copy = (text: string): void => { void navigator.clipboard?.writeText(text).catch(() => {}) }
  return (
    <div
      ref={ref}
      className="dshWorkspaceMenu dshWorkspaceFileMenu"
      role="menu"
      aria-label={`Actions for ${row.path}`}
      style={{ position: 'fixed', top: position.y, left: position.x, right: 'auto' }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
        const at = items.indexOf(document.activeElement as HTMLElement)
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}
    >
      {row.kind === 'file' && item('Open', () => { actions.open(row.path) })}
      {row.kind === 'file' && item('Open to the side', () => { actions.open(row.path, { beside: true }) })}
      {row.kind === 'file' && isMarkdown(row.name) && item('Preview', () => { actions.preview(row.path) })}
      {row.kind === 'dir' && item(row.open ? 'Collapse' : 'Expand', () => { actions.toggle(row.path) })}
      <div className="dshWorkspaceMenuRule" />
      {item('New file here', () => { actions.createIn(dir, 'file') })}
      {item('New folder here', () => { actions.createIn(dir, 'dir') })}
      <div className="dshWorkspaceMenuRule" />
      {item('Copy path', () => { copy(`${worktree.replace(/[\\/]+$/u, '')}/${row.path}`) })}
      {item('Copy relative path', () => { copy(row.path) })}
      <div className="dshWorkspaceMenuRule" />
      {item('Rename or move', () => { actions.rename(row) })}
      {item('Delete', () => { actions.remove(row) })}
    </div>
  )
}
