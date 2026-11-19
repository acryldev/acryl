/** The `comments` right-sidebar tab type, listed under Checks on the Start page: a dependency-gated child plugin like the Review tab. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@acryl/ui/frame'
import { CommentsBody, type CommentTerminals } from './CommentsBody.tsx'
import type { CommentStore } from './comment-store.ts'
import type { WriteText } from './use-comments.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { CommentsGlyph } from '../chrome/panel-icons.tsx'

export const COMMENTS_KIND = 'comments'
export const COMMENTS_ID = 'acryl-workspace/comments'

/** PENDING (not failed) while the upstream right sidebar is absent; both registrations unwind together. */
export function commentsTabPlugin(shell: WorkspaceShellState, comments: CommentStore, terminals: CommentTerminals, writeText: WriteText | undefined) {
  return {
    name: 'acryl-workspace-comments-tab',
    inject: ['sidebarRightTabs', 'slots'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => {
        const removeType = ctx.sidebarRightTabs.register({
          id: COMMENTS_ID,
          kind: COMMENTS_KIND,
          priority: 'builtin',
          title: () => 'Comments',
          guide: [{
            id: COMMENTS_ID,
            icon: CommentsGlyph,
            order: 50,
            title: () => 'Comments',
            description: () => 'Your comments on lines of files: copy them, or send them to an open terminal or agent',
          }],
        })
        const removeBody = ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: COMMENTS_ID,
          inject: () => ({ shell, comments, terminals, writeText }),
        }, CommentsBody)
        return () => {
          removeBody()
          removeType()
        }
      }, 'acryl-workspace: Comments tab type')
    },
  }
}
