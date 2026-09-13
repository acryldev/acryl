/**
 * Scrollable-list windowing shared by every overlay that paints a
 * selection-following list (`/login`'s provider list, `/model`'s picker and
 * provider list). Previously duplicated verbatim in `LoginOverlay.ts` and
 * `ModelProfileOverlay.ts` (specs/001-acryl-refactor-improvements-and-tech-debt, R7).
 * @module @tomowang/dsh-tui/tui/listWindow
 */

/**
 * Rows available for a scrollable list body: terminal height minus the lines
 * every such screen spends on chrome (header/hint/notice/search — `chrome`
 * lines, caller-counted since it varies by screen). Long catalogs (~35
 * providers, matching that many models) previously rendered every row
 * unconditionally, pushing the key-legend hint line — the only place a
 * shortcut is documented — past the bottom of the terminal, invisible
 * without scrolling back. Every list-shaped view windows around the current
 * selection instead, so the hint line is always the last line printed and
 * always fits on screen.
 */
export function listWindow(terminalRows: number, chrome: number): number {
  return Math.max(3, terminalRows - chrome)
}

/** The `[start, end)` slice of `count` items to show so `selected` stays visible within `maxVisible` rows, biased to keep it centered. */
export function visibleRange(count: number, selected: number, maxVisible: number): { start: number; end: number } {
  if (count <= maxVisible) return { start: 0, end: count }
  const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), count - maxVisible))
  return { start, end: start + maxVisible }
}
