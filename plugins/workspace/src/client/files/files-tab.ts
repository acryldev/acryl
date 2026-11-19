/** The right sidebar's Files tab: ACRYL's tree, a dependency-gated child plugin like the Changes, Review and Checks tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@acryl/ui/frame'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { FilesBody } from './FilesBody.tsx'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceFilesApi } from './files-api.ts'
import { CodeGlyph } from '../chrome/panel-icons.tsx'

/**
 * DSH's own Files tab kind (`ui-sidebar-files`). In the advanced shell ACRYL's tree takes it over at the `extension` band, which the tab
 * registry lets shadow a `builtin` of the same kind until it unregisters: one Files tab, whose files open in ACRYL's editor (breadcrumbs,
 * line comments) rather than DSH's read-only preview, and DSH's start-page entry and `workspace.files` command lead to it.
 */
export const DSH_FILES_KIND = 'files'
/** The kind ACRYL's tree had before the takeover; still registered (with no start-page entry) so a tab the user kept open still shows. */
export const FILES_KIND = 'worktree-files'
export const FILES_ID = 'acryl-workspace/files'
export const FILES_TAKEOVER_ID = 'acryl-workspace/files-takeover'

/**
 * PENDING (not failed) while the upstream right sidebar is absent; every registration unwinds together.
 * @param takeOver - the advanced shell: ACRYL's tree replaces DSH's Files tab. Compatibility mode runs DSH's own client unchanged, so
 *   there the tree stays a separate "Code" tab.
 */
export function filesTabPlugin(shell: WorkspaceShellState, filesApi: WorkspaceFilesApi, gitApi: WorkspaceGitApi, takeOver = false) {
  return {
    name: 'acryl-workspace-files-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const title = takeOver ? 'Files' : 'Code'
        const guide = [{
          id: FILES_ID,
          icon: CodeGlyph,
          order: 10,
          title: () => title,
          description: () => 'Browse the worktree and open a file in the editor',
        }]
        const removers: (() => void)[] = []
        const add = (id: string, kind: string, priority: 'extension' | 'builtin', withGuide: boolean): void => {
          removers.push(ctx.sidebarRightTabs.register({ id, kind, priority, title: () => title, ...(withGuide ? { guide } : {}) }))
          removers.push(ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, inject: () => ({ shell, filesApi, gitApi }) }, FilesBody))
        }
        add(FILES_ID, FILES_KIND, 'builtin', !takeOver)
        if (takeOver) add(FILES_TAKEOVER_ID, DSH_FILES_KIND, 'extension', true)
        return () => { for (const remove of removers.reverse()) remove() }
      }, 'acryl-workspace: Files tab type')
    },
  }
}
