/** Pure model of the Files tab tree: which directories are open, what each holds, the rows to show, and which of them to draw. */

import type { FileEntry } from '../../files/contract.ts'

export type DirState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'ready'; readonly entries: readonly FileEntry[]; readonly truncated: boolean }

export interface TreeRow {
  /** Path relative to the worktree, `/`-separated. */
  readonly path: string
  readonly name: string
  readonly kind: 'file' | 'dir'
  readonly depth: number
  readonly open: boolean
  /** Git ignores it, or a folder above it. */
  readonly ignored: boolean
  /** Set on a directory row whose content is still loading or failed. */
  readonly status?: 'loading' | 'error'
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}

/** The folder holding `path`; `''` for an entry of the root. */
export function parentOf(path: string): string {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

/** Flatten the loaded directories into the visible rows, honouring which are open. */
export function visibleRows(dirs: ReadonlyMap<string, DirState>, open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (dir: string, depth: number, ignoredAbove: boolean): void => {
    const state = dirs.get(dir)
    if (state === undefined || state.phase !== 'ready') return
    for (const entry of state.entries) {
      const path = joinPath(dir, entry.name)
      const ignored = ignoredAbove || entry.ignored === true
      if (entry.kind === 'file') {
        rows.push({ path, name: entry.name, kind: 'file', depth, open: false, ignored })
        continue
      }
      const isOpen = open.has(path)
      const child = dirs.get(path)
      const status = isOpen && child !== undefined && child.phase !== 'ready' ? child.phase : undefined
      rows.push({ path, name: entry.name, kind: 'dir', depth, open: isOpen, ignored, ...(status === undefined ? {} : { status }) })
      if (isOpen) walk(path, depth + 1, ignored)
    }
  }
  walk('', 0, false)
  return rows
}

/** What a key does to the tree, given the row it is on. */
export type TreeMove =
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'toggle'; readonly path: string }
  | { readonly kind: 'open'; readonly path: string }
  | { readonly kind: 'none' }

/**
 * Arrow keys walk the rows; Right opens a closed folder, then steps into it; Left closes an open folder, then steps to its parent; Enter
 * opens a file or toggles a folder; Home and End jump to the ends.
 */
export function moveFor(key: string, rows: readonly TreeRow[], index: number): TreeMove {
  const row = rows[index]
  const last = rows.length - 1
  if (key === 'ArrowDown') return { kind: 'focus', index: Math.min(index + 1, last) }
  if (key === 'ArrowUp') return { kind: 'focus', index: Math.max(index - 1, 0) }
  if (key === 'Home') return { kind: 'focus', index: 0 }
  if (key === 'End') return { kind: 'focus', index: Math.max(last, 0) }
  if (row === undefined) return { kind: 'none' }
  if (key === 'Enter') return row.kind === 'dir' ? { kind: 'toggle', path: row.path } : { kind: 'open', path: row.path }
  if (key === 'ArrowRight') {
    if (row.kind !== 'dir') return { kind: 'none' }
    if (!row.open) return { kind: 'toggle', path: row.path }
    const child = rows[index + 1]
    return child !== undefined && child.depth > row.depth ? { kind: 'focus', index: index + 1 } : { kind: 'none' }
  }
  if (key === 'ArrowLeft') {
    if (row.kind === 'dir' && row.open) return { kind: 'toggle', path: row.path }
    const parent = parentOf(row.path)
    if (parent === '') return { kind: 'none' }
    const at = rows.findIndex(candidate => candidate.path === parent)
    return at < 0 ? { kind: 'none' } : { kind: 'focus', index: at }
  }
  return { kind: 'none' }
}

/** Rows drawn beyond each edge of the view, so a fast scroll never shows a gap. */
export const OVERSCAN_ROWS = 8

/**
 * The rows to draw for a scroll position: only those in view, plus a margin. A long tree (an opened `node_modules`) stays as fast as a
 * short one.
 * @param viewHeight - the scroll box's height; 0 before it is measured, which draws a first screenful.
 */
export function rowWindow(count: number, rowHeight: number, scrollTop: number, viewHeight: number): { readonly first: number; readonly last: number } {
  const height = viewHeight > 0 ? viewHeight : 40 * rowHeight
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
  const last = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN_ROWS)
  return { first, last }
}

/** The scroll position that shows row `index` whole, moving as little as possible; `scrollTop` itself when it is already in view. */
export function scrollToShow(index: number, rowHeight: number, scrollTop: number, viewHeight: number): number {
  const top = index * rowHeight
  if (top < scrollTop) return top
  if (viewHeight > 0 && top + rowHeight > scrollTop + viewHeight) return top + rowHeight - viewHeight
  return scrollTop
}
