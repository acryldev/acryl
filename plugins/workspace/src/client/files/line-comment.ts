/**
 * A comment on lines of a file, as an agent reads it: which file (relative and absolute, so the agent finds it from any folder), which
 * lines with their text, then the comment. The same text is copied to the clipboard and typed into a terminal, as a paste that is not
 * submitted, so several comments can be collected and sent with one Enter.
 */

export interface LineComment {
  /** Absolute worktree path. */
  readonly worktree: string
  /** The file, relative to the worktree, `/`-separated. */
  readonly file: string
  /** First and last commented line, 1-based. */
  readonly fromLine: number
  readonly toLine: number
  /** The commented lines' text, `fromLine` first. */
  readonly lines: readonly string[]
  readonly text: string
}

/** How many commented lines are quoted; a longer range is cut with a note (the agent can open the file). */
export const QUOTED_LINES = 12

const where = (comment: LineComment): string => {
  const lines = comment.toLine > comment.fromLine ? `${String(comment.fromLine)}-${String(comment.toLine)}` : String(comment.fromLine)
  return `${comment.worktree.replace(/[\\/]+$/u, '')}/${comment.file}:${lines}`
}

/**
 * @param multiline - the terminal takes a multi-line paste (bracketed paste is on). Without it the comment is one line, because each line
 * break would press Enter and a shell would run the lines.
 */
export function commentForTerminal(comment: LineComment, multiline: boolean): string {
  const text = comment.text.trim()
  const range = comment.toLine > comment.fromLine ? `lines ${String(comment.fromLine)}-${String(comment.toLine)}` : `line ${String(comment.fromLine)}`
  if (!multiline) {
    const quoted = comment.lines[0]?.trim() ?? ''
    return `Comment on ${comment.file} ${range} (${where(comment)})${quoted === '' ? '' : `, at "${quoted}"`}: ${text.replace(/\s*\n\s*/gu, ' ')} `
  }
  const width = String(comment.toLine).length
  const shown = comment.lines.slice(0, QUOTED_LINES).map((line, index) => `  ${String(comment.fromLine + index).padStart(width)} | ${line}`)
  const more = comment.lines.length - shown.length
  return [
    `Comment on ${comment.file} ${range} (${where(comment)}):`,
    ...shown,
    ...(more > 0 ? [`  ... ${String(more)} more lines`] : []),
    text,
    '',
  ].join('\n')
}

/** Several comments as one text: a blank line between them, or one after another on one line for a terminal that would run each line. */
export function commentsForTerminal(comments: readonly LineComment[], multiline: boolean): string {
  return comments.map(comment => commentForTerminal(comment, multiline)).join(multiline ? '\n' : '')
}
