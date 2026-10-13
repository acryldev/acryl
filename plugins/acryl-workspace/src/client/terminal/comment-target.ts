/**
 * Where a line comment from the code editor goes: into the terminal the user worked in last (usually the agent they are talking to), typed
 * as a paste and not submitted, so the user can add more and send it with Enter.
 */

import { commentForTerminal, type LineComment } from '../files/line-comment.ts'
import type { CommentResult } from '../files/line-comments.ts'
import type { TerminalSession } from './terminal-session.ts'

export interface CommentTargetDeps {
  /** The terminal the user worked in last that is still running. */
  readonly lastActive: () => Pick<TerminalSession, 'id' | 'paste' | 'takesMultilinePaste'> | undefined
  /** The name of a terminal's tab, as the user sees it. */
  readonly nameOf: (terminalId: string) => string | undefined
}

export function sendCommentToTerminal(deps: CommentTargetDeps, comment: LineComment): CommentResult {
  const terminal = deps.lastActive()
  if (terminal === undefined) return { ok: false, message: 'No terminal to send it to. Start an agent in a terminal tab (or click into the one you use), then comment again.' }
  terminal.paste(commentForTerminal(comment, terminal.takesMultilinePaste()))
  return { ok: true, where: deps.nameOf(terminal.id) ?? 'the terminal' }
}
