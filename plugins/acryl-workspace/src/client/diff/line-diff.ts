/**
 * Minimal, dependency-free line diff (LCS-based, Myers-equivalent for small inputs). Spec 040
 * open question 5 leaves "which diff-rendering library" unresolved, so this pass ships a small,
 * real, self-contained algorithm rather than take on an unresolved external dependency - it is
 * genuinely useful (a real unified-diff view, not a stub) and can be swapped for a library later
 * without changing the Diff tile's own contract (an array of DiffLine).
 */

export type DiffLineKind = 'context' | 'add' | 'remove'

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
}

/** Longest-common-subsequence line diff between two texts. */
export function diffLines(before: string, after: string): readonly DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]. Rows/cells are always populated by the
  // fill below (n+1 rows of m+1 zeros each), so `?? 0` here documents that invariant for
  // noUncheckedIndexedAccess rather than expressing a real fallback.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] ?? []
    const nextRow = lcs[i + 1] ?? []
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    // Loop-bounded, so always defined - `?? ''` documents that rather than expressing a real fallback.
    const lineA = a[i] ?? ''
    const lineB = b[j] ?? ''
    if (lineA === lineB) {
      lines.push({ kind: 'context', text: lineA })
      i += 1
      j += 1
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      lines.push({ kind: 'remove', text: lineA })
      i += 1
    } else {
      lines.push({ kind: 'add', text: lineB })
      j += 1
    }
  }
  while (i < n) { lines.push({ kind: 'remove', text: a[i] ?? '' }); i += 1 }
  while (j < m) { lines.push({ kind: 'add', text: b[j] ?? '' }); j += 1 }
  return lines
}
