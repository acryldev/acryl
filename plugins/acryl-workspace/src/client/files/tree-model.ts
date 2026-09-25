/** Pure model of the Files tab tree: which directories are open, what each holds, and the rows to show. */

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
  /** Set on a directory row whose content is still loading or failed. */
  readonly status?: 'loading' | 'error'
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}

/**
 * Flatten the loaded directories into the visible rows, honouring which are open. With a filter, every
 * loaded entry whose name contains it is listed flat (a search over what has been opened so far).
 */
export function visibleRows(
  dirs: ReadonlyMap<string, DirState>,
  open: ReadonlySet<string>,
  filter: string,
): TreeRow[] {
  const needle = filter.trim().toLowerCase()
  const rows: TreeRow[] = []
  if (needle !== '') {
    for (const [dir, state] of dirs) {
      if (state.phase !== 'ready') continue
      for (const entry of state.entries) {
        if (entry.kind === 'file' && entry.name.toLowerCase().includes(needle)) {
          rows.push({ path: joinPath(dir, entry.name), name: entry.name, kind: 'file', depth: 0, open: false })
        }
      }
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }))
  }
  const walk = (dir: string, depth: number): void => {
    const state = dirs.get(dir)
    if (state === undefined || state.phase !== 'ready') return
    for (const entry of state.entries) {
      const path = joinPath(dir, entry.name)
      if (entry.kind === 'file') {
        rows.push({ path, name: entry.name, kind: 'file', depth, open: false })
        continue
      }
      const isOpen = open.has(path)
      const child = dirs.get(path)
      const status = isOpen && child !== undefined && child.phase !== 'ready' ? child.phase : undefined
      rows.push({ path, name: entry.name, kind: 'dir', depth, open: isOpen, ...(status === undefined ? {} : { status }) })
      if (isOpen) walk(path, depth + 1)
    }
  }
  walk('', 0)
  return rows
}
