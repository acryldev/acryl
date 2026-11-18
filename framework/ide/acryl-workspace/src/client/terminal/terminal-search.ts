/** Searching a terminal's scrollback: pure rules over the lines the terminal holds. */

export interface TerminalMatch {
  /** Absolute row in the buffer (scrollback included) and the column where the match starts. */
  readonly row: number
  readonly col: number
  readonly length: number
}

export const MAX_MATCHES = 2000

/** @returns every case-insensitive occurrence of `query` in `lines`, top to bottom, at most {@link MAX_MATCHES}. */
export function findMatches(lines: readonly string[], query: string): TerminalMatch[] {
  if (query === '') return []
  const needle = query.toLowerCase()
  const matches: TerminalMatch[] = []
  for (let row = 0; row < lines.length && matches.length < MAX_MATCHES; row += 1) {
    const text = (lines[row] ?? '').toLowerCase()
    let from = 0
    for (;;) {
      const col = text.indexOf(needle, from)
      if (col === -1) break
      matches.push({ row, col, length: needle.length })
      from = col + Math.max(1, needle.length)
      if (matches.length >= MAX_MATCHES) break
    }
  }
  return matches
}

/**
 * @param count - number of matches.
 * @param current - index of the match now selected, or -1 when none is.
 * @returns the index to move to, wrapping around at both ends; -1 when there are no matches.
 */
export function stepMatch(count: number, current: number, direction: 1 | -1): number {
  if (count === 0) return -1
  if (current < 0) return direction === 1 ? 0 : count - 1
  return (current + direction + count) % count
}

/** Cmd+F on macOS, Ctrl+Shift+F elsewhere (plain Ctrl+F belongs to the shell). */
export function isSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, mac: boolean): boolean {
  if (event.altKey || event.key.toLowerCase() !== 'f') return false
  return mac ? event.metaKey && !event.ctrlKey && !event.shiftKey : event.ctrlKey && event.shiftKey && !event.metaKey
}
