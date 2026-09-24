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
