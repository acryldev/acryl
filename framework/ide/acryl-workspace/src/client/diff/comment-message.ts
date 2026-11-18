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
  /** Last line of a multi-line comment (same side); absent for a single line. */
  readonly endLine?: number
  /** For a multi-line comment, every line in the range with its own kind, so the block shows real markers. */
  readonly rangeLines?: readonly { readonly kind: CommentLineKind; readonly text: string }[]
  readonly comment: string
}

const MARKER: Record<CommentLineKind, string> = { add: '+', remove: '-', context: ' ' }

/**
 * Compose a message that carries enough context for the agent to act without opening the diff:
 * the file, the version and line number, the branch, the line itself, then the reviewer's words.
 * The session log then holds the comment durably, with no separate store.
 */
export function buildReviewComment(input: ReviewCommentInput): string {
  const range = input.endLine !== undefined && input.endLine > input.line
  const where = `${input.side === 'new' ? 'new' : 'old'} ${range ? 'lines' : 'line'} ${String(input.line)}${range ? `-${String(input.endLine)}` : ''}`
  const branch = input.branch === null || input.branch === undefined ? '' : `, branch ${input.branch}`
  return [
    `Review comment on \`${input.file}\` (${where}${branch}):`,
    '',
    '```diff',
    ...(range && input.rangeLines !== undefined && input.rangeLines.length > 0
      ? input.rangeLines.map(line => `${MARKER[line.kind]}${line.text}`)
      : [`${MARKER[input.kind]}${input.lineText}`]),
    '```',
    '',
    input.comment.trim(),
  ].join('\n')
}
