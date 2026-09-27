/** The palette's file source: the worktree's own name and content search, shaped into palette items. */

import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { PaletteItem } from './palette-items.ts'
import type { FileSearch } from './palette-state.ts'

function splitPath(file: string): { readonly name: string; readonly dir: string } {
  const slash = file.lastIndexOf('/')
  return slash === -1 ? { name: file, dir: '' } : { name: file.slice(slash + 1), dir: file.slice(0, slash) }
}

/**
 * @param gitApi - the git routes, whose search is confined to the worktree.
 * @param worktree - the selected worktree, or undefined when none is selected (then there are no file results).
 * @param open - opens a file in an editor tab.
 */
export function createFileSearch(
  gitApi: Pick<WorkspaceGitApi, 'search'>,
  worktree: () => string | undefined,
  open: (worktree: string, file: string, line?: number) => void,
): FileSearch {
  return async (query, mode) => {
    const path = worktree()
    if (path === undefined) return []
    const view = await gitApi.search(path, query, mode)
    const items: PaletteItem[] = []
    for (const hit of view.hits) {
      const { name, dir } = splitPath(hit.file)
      const line = hit.line
      items.push({
        id: `file:${hit.file}:${String(line ?? 0)}`,
        group: 'file',
        title: mode === 'content' && line !== undefined ? `${name}:${String(line)}` : name,
        subtitle: mode === 'content' && hit.text !== undefined ? `${dir === '' ? '' : `${dir} - `}${hit.text.trim()}` : dir,
        run: () => { open(path, hit.file, line) },
      })
    }
    return items
  }
}
