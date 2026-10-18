/** One open file's view of the workspace's comments, as the code editor's notes use it. */

import type { EditorComments } from '../files/line-comments.ts'
import type { CommentStore } from './comment-store.ts'
import { copyComments, type WriteText } from './use-comments.ts'

/** @param writeText - the clipboard; undefined where the page has none (copying then says so). */
export function editorComments(store: CommentStore, worktree: string, file: string, writeText: WriteText | undefined): EditorComments {
  return {
    notes: () => store.forFile(worktree, file).map(comment => ({ id: comment.id, fromLine: comment.fromLine, toLine: comment.toLine, text: comment.text })),
    subscribe: listener => store.subscribe(listener),
    add: request => { store.add({ worktree, file, ...request }) },
    move: (id, fromLine, toLine) => { store.move(id, fromLine, toLine) },
    close: (id) => { store.remove([id]) },
    copy: id => copyComments(store, writeText, store.forFile(worktree, file).filter(comment => comment.id === id)),
    copyAll: () => copyComments(store, writeText, store.forWorktree(worktree)),
  }
}
