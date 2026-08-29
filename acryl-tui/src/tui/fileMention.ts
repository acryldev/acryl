/**
 * `@`-file-mention detection and candidate filtering for the prompt buffer —
 * the `@` counterpart to `commands.ts`'s `/`-command query, applied around
 * the cursor instead of anchored to the start of the line so a mention can
 * open mid-sentence.
 * @module @tomowang/dsh-tui/tui/fileMention
 */

/** Max dropdown rows shown for a `@`-mention query. */
export const FILE_MENTION_MAX_MATCHES = 10

export interface MentionQuery {
  readonly isMentionMode: boolean
  /** Text typed after `@`, excluding the `@` itself. */
  readonly query: string
  /** Index of the `@` that opened this mention, or `-1` outside mention mode. */
  readonly start: number
}

const NOT_MENTION: MentionQuery = { isMentionMode: false, query: '', start: -1 }

/**
 * Find the `@`-mention token, if any, ending at `cursor`.
 * @param value - the full prompt buffer.
 * @param cursor - the buffer offset the reader is currently editing at.
 * @returns the open mention's query/span, or `isMentionMode: false` outside one.
 */
export function mentionQuery(value: string, cursor: number): MentionQuery {
  let i = cursor
  while (i > 0 && !/\s/.test(value[i - 1])) i--
  if (i === cursor || value[i] !== '@') return NOT_MENTION
  const before = value[i - 1]
  if (before !== undefined && !/\s/.test(before)) return NOT_MENTION
  return { isMentionMode: true, query: value.slice(i + 1, cursor), start: i }
}

/**
 * Filter and rank file candidates for a `@`-mention query.
 * @param candidates - the full file index, repo-relative paths.
 * @param query - text typed after `@` (case-insensitive substring match).
 * @param limit - max rows returned.
 * @returns matches ranked by path-prefix, then basename-prefix, then path length.
 */
export function matchFileCandidates(candidates: readonly string[], query: string, limit = FILE_MENTION_MAX_MATCHES): readonly string[] {
  const needle = query.toLowerCase()
  const matches = candidates.filter(path => path.toLowerCase().includes(needle))
  matches.sort((a, b) => rank(a, needle) - rank(b, needle) || a.length - b.length)
  return matches.slice(0, limit)
}

function rank(path: string, needle: string): number {
  const lower = path.toLowerCase()
  if (lower.startsWith(needle)) return 0
  const basename = lower.slice(lower.lastIndexOf('/') + 1)
  if (basename.startsWith(needle)) return 1
  return 2
}
