/** The `files` right-sidebar tab type: a dependency-gated child plugin like the Changes, Review and Checks tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { FilesBody } from './FilesBody.tsx'
import type { WorkspaceFilesApi } from './files-api.ts'

export const FILES_KIND = 'files'
export const FILES_ID = 'acryl-workspace/files'

/** PENDING (not failed) while the upstream right sidebar is absent; both registrations unwind together. */
export function filesTabPlugin(shell: WorkspaceShellState, filesApi: WorkspaceFilesApi) {
  return {
    name: 'acryl-workspace-files-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: FILES_ID,
          kind: FILES_KIND,
          priority: 'builtin',
          title: () => 'Files',
          guide: [{
            order: 10,
            title: () => 'Files',
            description: () => 'Browse the worktree and open a file in the editor',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: FILES_ID,
          inject: () => ({ shell, filesApi }),
        }, FilesBody)
        return () => {
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Files tab type')
    },
  }
}
