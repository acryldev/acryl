/**
 * Using comments, the two ways the user chose: copy them (one, or all of a worktree) to paste anywhere, or send them into one open terminal
 * or agent. Either way they are used up: they leave the list and their notes close. Nothing is used up when the copy or the send failed.
 */

import { commentForTerminal, commentsForTerminal } from '../files/line-comment.ts'
import type { CommentStore, OpenComment } from './comment-store.ts'

export type UseResult = { readonly ok: true } | { readonly ok: false, readonly message: string }

/** The clipboard, as the page has it. */
export type WriteText = (text: string) => Promise<void>

/** The browser's clipboard; undefined where the page has none. */
export function browserClipboard(): WriteText | undefined {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  return clipboard === undefined ? undefined : text => clipboard.writeText(text)
}

/** Copy `comments` as one text and use them up. */
export async function copyComments(store: Pick<CommentStore, 'remove'>, writeText: WriteText | undefined, comments: readonly OpenComment[]): Promise<UseResult> {
  if (comments.length === 0) return { ok: false, message: 'No comments to copy.' }
  if (writeText === undefined) return { ok: false, message: 'This page has no clipboard.' }
  try {
    await writeText(commentsForTerminal(comments, true))
  } catch {
    return { ok: false, message: 'The clipboard refused. Click into the page and try again.' }
  }
  store.remove(comments.map(comment => comment.id))
  return { ok: true }
}

/** A running terminal, as far as sending into it goes. */
export interface PasteTarget {
  readonly paste: (text: string) => void
  readonly takesMultilinePaste: () => boolean
}

/**
 * Type `comments` into the terminal as one paste, not submitted, so the user can add to it and press Enter; then use them up. A program
 * without bracketed paste gets each comment as one line, so a shell never runs them.
 */
export function sendComments(store: Pick<CommentStore, 'remove'>, target: PasteTarget | undefined, comments: readonly OpenComment[]): UseResult {
  if (comments.length === 0) return { ok: false, message: 'No comments to send.' }
  if (target === undefined) return { ok: false, message: 'That terminal has closed.' }
  const multiline = target.takesMultilinePaste()
  target.paste(comments.length === 1 && comments[0] !== undefined ? commentForTerminal(comments[0], multiline) : commentsForTerminal(comments, multiline))
  store.remove(comments.map(comment => comment.id))
  return { ok: true }
}
