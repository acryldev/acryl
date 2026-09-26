/** Parse `git diff` unified output into display rows with old and new line numbers. */

export type UnifiedRowKind = 'meta' | 'hunk' | 'context' | 'add' | 'remove'

export interface UnifiedRow {
  readonly kind: UnifiedRowKind
  readonly text: string
  /** Line number in the old file; absent for added lines and meta rows. */
  readonly oldNo?: number
  /** Line number in the new file; absent for removed lines and meta rows. */
  readonly newNo?: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * @param text - unified diff text for one file.
 * @returns one row per line, with line numbers tracked across hunks.
 */
export function parseUnifiedDiff(text: string): UnifiedRow[] {
  if (text === '') return []
  const rows: UnifiedRow[] = []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  for (const line of lines) {
    const hunk = HUNK_HEADER.exec(line)
    if (hunk !== null) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      inHunk = true
      rows.push({ kind: 'hunk', text: line })
      continue
    }
    if (!inHunk) {
      rows.push({ kind: 'meta', text: line })
      continue
    }
    const marker = line[0]
    if (marker === '+') {
      rows.push({ kind: 'add', text: line.slice(1), newNo })
      newNo += 1
    } else if (marker === '-') {
      rows.push({ kind: 'remove', text: line.slice(1), oldNo })
      oldNo += 1
    } else if (marker === '\\') {
      rows.push({ kind: 'meta', text: line })
    } else {
      rows.push({ kind: 'context', text: line.slice(1), oldNo, newNo })
      oldNo += 1
      newNo += 1
    }
  }
  return rows
}

/** One display row of the side-by-side layout: a hunk header, or an old-side cell next to a new-side cell. */
export type SplitRow =
  | { readonly kind: 'hunk'; readonly text: string }
  | { readonly kind: 'pair'; readonly left?: UnifiedRow; readonly right?: UnifiedRow }

/**
 * Lay unified rows out side by side: context on both sides, and each run of removals next to the run of
 * additions that follows it (zipped, the shorter side left empty). Meta rows are dropped.
 */
export function pairRows(rows: readonly UnifiedRow[]): SplitRow[] {
  const out: SplitRow[] = []
  let index = 0
  while (index < rows.length) {
    const row = rows[index]
    if (row === undefined) break
    if (row.kind === 'meta') { index += 1; continue }
    if (row.kind === 'hunk') { out.push({ kind: 'hunk', text: row.text }); index += 1; continue }
    if (row.kind === 'context') { out.push({ kind: 'pair', left: row, right: row }); index += 1; continue }
    const removed: UnifiedRow[] = []
    const added: UnifiedRow[] = []
    while (rows[index]?.kind === 'remove') { removed.push(rows[index] as UnifiedRow); index += 1 }
    while (rows[index]?.kind === 'add') { added.push(rows[index] as UnifiedRow); index += 1 }
    const length = Math.max(removed.length, added.length)
    for (let i = 0; i < length; i += 1) {
      const left = removed[i]
      const right = added[i]
      out.push({ kind: 'pair', ...(left === undefined ? {} : { left }), ...(right === undefined ? {} : { right }) })
    }
  }
  return out
}

/** The rows of one file version between two line numbers, inclusive, in diff order. */
export function rowsInRange(rows: readonly UnifiedRow[], side: 'old' | 'new', from: number, to: number): UnifiedRow[] {
  return rows.filter((row) => {
    if (row.kind === 'meta' || row.kind === 'hunk') return false
    const no = side === 'old' ? row.oldNo : row.newNo
    return no !== undefined && no >= from && no <= to
  })
}

