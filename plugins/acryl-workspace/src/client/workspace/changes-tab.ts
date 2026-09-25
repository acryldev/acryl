/** The `changes` right-sidebar tab type, registered through upstream's public two-stage path. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { ChangesBody } from './ChangesBody.tsx'
import type { WorkspaceShellState } from './shell-state.ts'

/** The tab kind this plugin owns. */
export const CHANGES_KIND = 'changes'
/** This implementation's identity in the tab system, and the key its body registers under. */
export const CHANGES_ID = 'acryl-workspace/changes'

/**
 * A dependency-gated child plugin: it is PENDING (not failed) while the upstream right sidebar is
 * absent, and mounts by itself when it appears, so it can never take the canvas or the left pane
 * down with it. Both registrations live inside one effect, so they unwind together.
 * @param shell - shared shell state the body reads and the reveal callback belongs to.
 */
export function changesTabPlugin(shell: WorkspaceShellState) {
  return {
    name: 'acryl-workspace-changes-tab',
    inject: ['sidebarRightTabs', 'sidebarRight', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: CHANGES_ID,
          kind: CHANGES_KIND,
          priority: 'builtin',
          title: () => 'Changes',
          guide: [{
            order: 20,
            title: () => 'Changes',
            description: () => 'Changed files in the selected worktree',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: CHANGES_ID,
          inject: () => ({ shell }),
        }, ChangesBody)
        // Picking a worktree in the left pane switches an OPEN right panel to its changes. It never opens
        // a closed panel: that would pop a large panel over the chat every time a branch is clicked.
        shell.setReveal(() => {
          try {
            if (ctx.sidebarRight.isExpanded()) ctx.sidebarRight.openTab(CHANGES_KIND)
          } catch {
            // No current chat session means there is no right sidebar to show it in.
          }
        })
        return () => {
          shell.setReveal(undefined)
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Changes tab type')
    },
  }
}
