/** The `checks` right-sidebar tab type: a dependency-gated child plugin like the Changes and Review tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { ChecksBody } from './ChecksBody.tsx'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export const CHECKS_KIND = 'checks'
export const CHECKS_ID = 'acryl-workspace/checks'

/** PENDING (not failed) while the upstream right sidebar is absent; both registrations unwind together. */
export function checksTabPlugin(shell: WorkspaceShellState, gitApi: WorkspaceGitApi) {
  return {
    name: 'acryl-workspace-checks-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: CHECKS_ID,
          kind: CHECKS_KIND,
          priority: 'builtin',
          title: () => 'Checks',
          guide: [{
            order: 40,
            title: () => 'Checks',
            description: () => 'Run the project scripts (test, lint, build) in a terminal tab',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: CHECKS_ID,
          inject: () => ({ shell, gitApi }),
        }, ChecksBody)
        return () => {
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Checks tab type')
    },
  }
}
