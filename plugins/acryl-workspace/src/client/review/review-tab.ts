/** The `review` right-sidebar tab type, registered like the Changes tab (dependency-gated child plugin). */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { ReviewBody } from './ReviewBody.tsx'
import type { ReviewStore } from './review-store.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export const REVIEW_KIND = 'review'
export const REVIEW_ID = 'acryl-workspace/review'

/**
 * PENDING (not failed) while the upstream right sidebar is absent; both registrations live in one
 * effect so they unwind together.
 */
export function reviewTabPlugin(shell: WorkspaceShellState, review: ReviewStore) {
  return {
    name: 'acryl-workspace-review-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: REVIEW_ID,
          kind: REVIEW_KIND,
          priority: 'builtin',
          title: () => 'Review',
          guide: [{
            order: 30,
            title: () => 'Review',
            description: () => 'Line comments sent to the agent, with resolve tracking',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: REVIEW_ID,
          inject: () => ({ shell, review }),
        }, ReviewBody)
        return () => {
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Review tab type')
    },
  }
}
