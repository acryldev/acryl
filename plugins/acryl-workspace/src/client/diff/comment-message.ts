/** The text a diff line comment becomes when it is sent to the agent as an ordinary user message. */

export type CommentSide = 'old' | 'new'
export type CommentLineKind = 'add' | 'remove' | 'context'

export interface ReviewCommentInput {
  /** Path relative to the worktree. */
  readonly file: string
  /** Branch the worktree has checked out, when known. */
  readonly branch: string | null | undefined
  /** Which file version the line number refers to. */
  readonly side: CommentSide
  readonly line: number
  readonly kind: CommentLineKind
  /** The diff line's text, without its +/- marker. */
  readonly lineText: string
  readonly comment: string
}

const MARKER: Record<CommentLineKind, string> = { add: '+', remove: '-', context: ' ' }

/**
 * Compose a message that carries enough context for the agent to act without opening the diff:
 * the file, the version and line number, the branch, the line itself, then the reviewer's words.
 * The session log then holds the comment durably, with no separate store.
 */
export function buildReviewComment(input: ReviewCommentInput): string {
  const where = `${input.side === 'new' ? 'new' : 'old'} line ${String(input.line)}`
  const branch = input.branch === null || input.branch === undefined ? '' : `, branch ${input.branch}`
  return [
    `Review comment on \`${input.file}\` (${where}${branch}):`,
    '',
    '```diff',
    `${MARKER[input.kind]}${input.lineText}`,
    '```',
    '',
    input.comment.trim(),
  ].join('\n')
}
