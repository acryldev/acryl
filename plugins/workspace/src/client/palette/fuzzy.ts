/**
 * Fuzzy matching for the command palette. A query matches when its characters appear in the text in order
 * (`nwt` finds "New worktree"); the score rewards a match at the start, at the start of a word and in an
 * unbroken run, and penalises gaps, so the closest reading ranks first. Pure; no dependencies.
 */

const WORD_START = /[\s\-_/.:>]/

/** @returns a score (higher is better), or null when `query` is not a subsequence of `text`. Matching ignores case. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (q === '') return 0
  let score = 0
  let position = 0
  let previous = -2
  for (const char of q) {
    const found = t.indexOf(char, position)
    if (found === -1) return null
    const atWordStart = found === 0 || WORD_START.test(t[found - 1] ?? '')
    score += 10
    if (found === previous + 1) score += 15
    if (atWordStart) score += 12
    if (found === 0) score += 6
    score -= Math.min(found - position, 6)
    previous = found
    position = found + 1
  }
  // A shorter text that contains the same letters is the closer reading.
  return score - Math.floor(t.length / 8)
}

/**
 * Every whitespace-separated term must match somewhere in the fields; the best score of each term is added.
 * The first field (the title) counts extra, so a title hit outranks a keyword hit.
 * @returns the total score, or null when a term matches no field.
 */
export function scoreFields(query: string, fields: readonly string[]): number | null {
  const terms = query.trim().split(/\s+/).filter(term => term !== '')
  if (terms.length === 0) return 0
  let total = 0
  for (const term of terms) {
    let best: number | null = null
    fields.forEach((field, index) => {
      const score = fuzzyScore(term, field)
      if (score === null) return
      const weighted = index === 0 ? score + 8 : score
      if (best === null || weighted > best) best = weighted
    })
    if (best === null) return null
    total += best
  }
  return total
}

/** @returns the indexes in `text` that `query` matched (for highlighting), or [] when it does not match. */
export function matchIndexes(query: string, text: string): number[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  const t = text.toLowerCase()
  const out: number[] = []
  let position = 0
  for (const char of q) {
    const found = t.indexOf(char, position)
    if (found === -1) return []
    out.push(found)
    position = found + 1
  }
  return out
}
