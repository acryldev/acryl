/** The `files` right-sidebar tab type: a dependency-gated child plugin like the Changes, Review and Checks tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { FilesBody } from './FilesBody.tsx'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceFilesApi } from './files-api.ts'

/**
 * Not `files`: DSH's own `sidebar-files` plugin already registers that right-panel tab kind, and the tab
 * registry rejects a second registration, which fails the whole client plugin tree.
 */
export const FILES_KIND = 'worktree-files'
export const FILES_ID = 'acryl-workspace/files'

/** PENDING (not failed) while the upstream right sidebar is absent; both registrations unwind together. */
export function filesTabPlugin(shell: WorkspaceShellState, filesApi: WorkspaceFilesApi, gitApi: WorkspaceGitApi) {
  return {
    name: 'acryl-workspace-files-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: FILES_ID,
          kind: FILES_KIND,
          priority: 'builtin',
          title: () => 'Code',
          guide: [{
            order: 10,
            title: () => 'Code',
            description: () => 'Browse the worktree and open a file in the editor',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: FILES_ID,
          inject: () => ({ shell, filesApi, gitApi }),
        }, FilesBody)
        return () => {
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Files tab type')
    },
  }
}
