/** The parts of an open file's path in the editor's breadcrumbs, each naming the folder its list shows. */

export interface Crumb {
  readonly label: string
  /** The folder this part lists, relative to the worktree (`''` for its root). */
  readonly dir: string
  /** The file itself (the last part), which lists the folder it is in. */
  readonly file: boolean
}

/** @param worktree - absolute worktree path. @param file - the file, relative to it, `/`-separated. */
export function crumbsFor(worktree: string, file: string): Crumb[] {
  const root = worktree.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() ?? worktree
  const parts = file.split('/').filter(part => part !== '')
  const crumbs: Crumb[] = [{ label: root === '' ? worktree : root, dir: '', file: false }]
  parts.forEach((part, index) => {
    const last = index === parts.length - 1
    crumbs.push({ label: part, dir: last ? parts.slice(0, index).join('/') : parts.slice(0, index + 1).join('/'), file: last })
  })
  return crumbs
}

/** The folder above `dir`; the root has none. */
export function parentDir(dir: string): string | undefined {
  if (dir === '') return undefined
  const at = dir.lastIndexOf('/')
  return at < 0 ? '' : dir.slice(0, at)
}

/**
 * How many leading parts fold into "..." so the rest fits: none when everything fits, never the file itself.
 * @param widths - each part's width, a part after the first including its separator.
 * @param ellipsis - the width of the "..." part.
 */
export function foldCount(widths: readonly number[], ellipsis: number, available: number): number {
  const last = widths.length - 1
  for (let folded = 0; folded < last; folded += 1) {
    const shown = widths.slice(folded).reduce((sum, width) => sum + width, 0)
    if ((folded === 0 ? 0 : ellipsis) + shown <= available) return folded
  }
  return Math.max(0, last)
}
