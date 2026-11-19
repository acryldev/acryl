/** Fuzzy file search for the Files tab (⌘P): the query's letters in order anywhere in the path, ranked like an editor's quick open. */

export interface FuzzyMatch {
  readonly path: string
  /** Indexes into `path` of the letters the query matched, ascending. */
  readonly hits: readonly number[]
  readonly score: number
}

const BOUNDARY = new Set(['/', '-', '_', '.', ' '])

/**
 * Match `query` against one path, case-insensitively, letters in order. Each matched letter scores; one right after the previous match, at the
 * start of a word, or in the file's own name scores more, a long gap or a long stretch from the first letter to the last scores less, and a
 * shorter path wins a tie. @returns undefined when the letters are not all there.
 */
export function fuzzyMatch(query: string, path: string): FuzzyMatch | undefined {
  const needle = query.replace(/\s+/g, '').toLowerCase()
  if (needle === '') return undefined
  const haystack = path.toLowerCase()
  const nameStart = path.lastIndexOf('/') + 1
  // Prefer the matches inside the file name: search from the name first, fall back to the whole path.
  const hits = matchFrom(needle, haystack, nameStart) ?? matchFrom(needle, haystack, 0)
  if (hits === undefined) return undefined
  let score = 0
  for (let index = 0; index < hits.length; index += 1) {
    const at = hits[index] as number
    score += 1
    // Adjacent letters score; letters far apart cost, so "main.ts" beats "migration-from-0-4.md" for "mai".
    if (index > 0) score += at === (hits[index - 1] as number) + 1 ? 4 : -Math.min(3, (at - (hits[index - 1] as number) - 1) / 4)
    if (at === 0 || BOUNDARY.has(path[at - 1] as string)) score += 3
    if (at >= nameStart) score += 2
  }
  // The letters spread over a long stretch cost as a whole too: "brd" in "board" beats "brd" in "bring-your-own-tool.md", wherever the name is.
  const spread = (hits.at(-1) as number) - (hits[0] as number) + 1 - hits.length
  score -= Math.min(10, spread / 2)
  return { path, hits, score: score - path.length / 100 }
}

function matchFrom(needle: string, haystack: string, start: number): number[] | undefined {
  const hits: number[] = []
  let from = start
  for (const letter of needle) {
    const at = haystack.indexOf(letter, from)
    if (at < 0) return undefined
    hits.push(at)
    from = at + 1
  }
  return hits
}

/** The best `limit` matches of `query` over `paths`, best first. */
export function fuzzySearch(query: string, paths: readonly string[], limit = 30): FuzzyMatch[] {
  const matches: FuzzyMatch[] = []
  for (const path of paths) {
    const match = fuzzyMatch(query, path)
    if (match !== undefined) matches.push(match)
  }
  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit)
}

/** A match split for display: the label is the path below its top folder, which is shown apart as the meta. */
export function displayMatch(match: FuzzyMatch): { readonly folder: string; readonly parts: readonly { readonly text: string; readonly hit: boolean }[] } {
  const slash = match.path.indexOf('/')
  const offset = slash < 0 ? 0 : slash + 1
  const folder = slash < 0 ? '' : match.path.slice(0, slash)
  const hit = new Set(match.hits)
  const parts: { text: string; hit: boolean }[] = []
  for (let index = offset; index < match.path.length; index += 1) {
    const isHit = hit.has(index)
    const last = parts.at(-1)
    if (last !== undefined && last.hit === isHit) last.text += match.path[index] as string
    else parts.push({ text: match.path[index] as string, hit: isHit })
  }
  return { folder, parts }
}
