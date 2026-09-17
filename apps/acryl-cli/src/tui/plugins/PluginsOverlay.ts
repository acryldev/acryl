/**
 * `/plugins` overlay: a scrollable list of every entry in the loader's tree,
 * snapshotted at open time (see `pluginRows()` in `session.ts`) rather than
 * kept live — the tree rarely changes mid-session, and re-snapshotting on
 * every render would fight the scroll position. A `mutable` row (a market or
 * profile-bundle plugin, per `AcrPluginLifecycleController.isMutable()`) can
 * be toggled in place with Enter, through the same `desktopPlugins`
 * preview/execute contract the Market's own Installed tab drives
 * (`actions.togglePlugin`); the returned fresh row snapshot replaces `rows`
 * without resetting scroll position, unlike a full overlay re-open would.
 *
 * `/` opens a fuzzy filter over the full row list — a real profile easily
 * carries 90+ Loader rows (every DSH core capability plus every installed
 * plugin), and a plain scroll makes finding one by name impractical. Typing
 * narrows `rows` to `filtered`; Escape clears the filter first (one more
 * Escape then closes the overlay, matching the "go back before you go away"
 * convention this session's sibling file-editor plugin just established for
 * its own back-navigation), so filtering never costs you the ability to
 * still close normally.
 * @module @tomowang/dsh-tui/tui/plugins/PluginsOverlay
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { PluginRow } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const success = fg(theme.success)
const accent = fg(theme.primary)

/**
 * Case-insensitive subsequence fuzzy match: every character of `query`, in
 * order, must appear somewhere in `target` (not necessarily contiguous) —
 * `dse` matches `dsh-editor`. Returns a score where lower is a tighter match
 * (total gap between consecutive matched characters, so `dshe` outscores
 * `d...s...h...e` spread across a long id) or `undefined` for no match, so
 * callers can filter on `undefined` and sort on the score in one pass.
 */
export function fuzzyScore(target: string, query: string): number | undefined {
  if (query === '') return 0
  const haystack = target.toLowerCase()
  const needle = query.toLowerCase()
  let hIndex = 0
  let score = 0
  let lastMatch = -1
  for (const ch of needle) {
    const found = haystack.indexOf(ch, hIndex)
    if (found === -1) return undefined
    if (lastMatch !== -1) score += found - lastMatch - 1
    lastMatch = found
    hIndex = found + 1
  }
  return score
}

/** Fuzzy-filter and rank rows by their best match across id and name, id preferred on a tie (it's what you usually remember/type). */
export function filterPluginRows(rows: readonly PluginRow[], query: string): readonly PluginRow[] {
  if (query === '') return rows
  const scored: { row: PluginRow; score: number }[] = []
  for (const row of rows) {
    const idScore = fuzzyScore(row.id, query)
    const nameScore = fuzzyScore(row.name, query)
    const best = idScore !== undefined && (nameScore === undefined || idScore <= nameScore) ? idScore : nameScore
    if (best !== undefined) scored.push({ row, score: best })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.map(s => s.row)
}

const STATE_LABEL: Record<NonNullable<PluginRow['state']>, string> = {
  pending: 'pending',
  loading: 'loading',
  active: 'active',
  failed: 'failed',
  disposed: 'disposed',
  unloading: 'unloading',
}

function rowLabel(row: PluginRow): string {
  if (row.state !== undefined) return STATE_LABEL[row.state]
  return row.disabled ? 'off' : '···'
}

function rowColor(row: PluginRow): ((s: string) => string) | undefined {
  if (row.disabled) return muted
  if (row.state === 'failed') return errorColor
  if (row.state === 'active') return success
  return undefined
}

export class PluginsOverlay implements Component {
  private scrollOffset = 0
  private selected = 0
  private rows: readonly PluginRow[]
  private status: string | undefined
  private busy = false
  private filtering = false
  private filterQuery = ''

  constructor(
    private readonly tui: TUI,
    initialRows: readonly PluginRow[],
    private readonly actions: TuiActions,
  ) {
    this.rows = initialRows
  }

  invalidate(): void {}

  /** The rows the filter query (if any) leaves visible, fuzzy-ranked — every navigation/render/toggle operation below indexes into this, never `rows` directly. */
  private visibleRows(): readonly PluginRow[] {
    return filterPluginRows(this.rows, this.filterQuery)
  }

  private listHeight(): number {
    const availableRows = Math.max(10, this.tui.terminal.rows - 1)
    const chrome = (this.filtering ? 1 : 0) + (this.status === undefined ? 2 : 3) // filter line + header + footer, plus a status line when present
    return Math.max(3, availableRows - chrome)
  }

  private maxOffset(visibleCount: number): number {
    return Math.max(0, visibleCount - this.listHeight())
  }

  /** Keep the selected row inside the visible window, scrolling the minimum amount needed. */
  private followSelection(visibleCount: number): void {
    const listHeight = this.listHeight()
    if (this.selected < this.scrollOffset) this.scrollOffset = this.selected
    else if (this.selected >= this.scrollOffset + listHeight) this.scrollOffset = this.selected - listHeight + 1
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxOffset(visibleCount)))
  }

  /** Re-clamp `selected`/`scrollOffset` after the visible set changes shape (a filter keystroke, or a toggle's fresh row snapshot). */
  private resyncSelection(): void {
    const visible = this.visibleRows()
    this.selected = Math.min(this.selected, Math.max(0, visible.length - 1))
    this.followSelection(visible.length)
  }

  private async toggle(): Promise<void> {
    const row = this.visibleRows()[this.selected]
    if (row === undefined || !row.mutable || this.busy) return
    this.busy = true
    this.status = `${row.disabled ? 'Enabling' : 'Disabling'} ${row.name}...`
    this.tui.requestRender()
    const result = await this.actions.togglePlugin(row.id, row.disabled)
    this.busy = false
    this.status = result.message
    if (result.rows !== undefined) {
      this.rows = result.rows
      this.resyncSelection()
    }
    this.tui.requestRender()
  }

  render(_width: number): string[] {
    const visible = this.visibleRows()
    const listHeight = this.listHeight()
    const offset = Math.min(this.scrollOffset, this.maxOffset(visible.length))
    const windowedRows = visible.slice(offset, offset + listHeight)
    const activeCount = this.rows.filter(row => row.state === 'active').length
    const failedCount = this.rows.filter(row => row.state === 'failed').length
    const lines: string[] = [
      bold(secondary(`Plugins (${this.rows.length}) — ${activeCount} active${failedCount === 0 ? '' : `, ${failedCount} failed`}`)),
    ]
    if (this.filtering || this.filterQuery !== '') {
      const matchNote = this.filterQuery === '' ? '' : muted(` (${String(visible.length)} match${visible.length === 1 ? '' : 'es'})`)
      lines.push(`${accent('/')}${this.filterQuery}${this.filtering ? accent('▏') : ''}${matchNote}`)
    }
    if (visible.length === 0) {
      lines.push(muted('  no matches'))
    }
    windowedRows.forEach((row, index) => {
      const rowIndex = offset + index
      const color = rowColor(row)
      const label = color === undefined ? rowLabel(row).padEnd(8) : color(rowLabel(row).padEnd(8))
      const id = row.disabled ? muted(` ${row.id}`) : ` ${row.id}`
      const marker = rowIndex === this.selected ? accent('> ') : '  '
      const toggleHint = row.mutable && rowIndex === this.selected ? muted(' [enter to toggle]') : ''
      lines.push(`${marker}${label}${id}${muted(` (${row.name})`)}${toggleHint}`)
    })
    if (this.status !== undefined) lines.push(this.busy ? muted(this.status) : success(this.status))
    lines.push(muted(this.filtering ? '↑↓ select · type to filter · enter toggle · esc clear' : '↑↓ select · / filter · enter toggle · esc close'))
    return lines
  }

  /** Navigation shared by filtering and non-filtering mode — moving the cursor must work identically in both, or filtering silently strands you on whatever row was selected before you started typing. Returns whether `data` was a navigation key it handled. */
  private handleNavigation(data: string): boolean {
    const visibleCount = this.visibleRows().length
    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1)
      this.followSelection(visibleCount)
      return true
    }
    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(visibleCount - 1, this.selected + 1)
      this.followSelection(visibleCount)
      return true
    }
    if (matchesKey(data, Key.pageUp)) {
      this.selected = Math.max(0, this.selected - this.listHeight())
      this.followSelection(visibleCount)
      return true
    }
    if (matchesKey(data, Key.pageDown)) {
      this.selected = Math.min(visibleCount - 1, this.selected + this.listHeight())
      this.followSelection(visibleCount)
      return true
    }
    return false
  }

  handleInput(data: string): void {
    if (this.filtering) {
      if (matchesKey(data, Key.escape)) {
        this.filtering = false
        this.filterQuery = ''
        this.resyncSelection()
        return
      }
      if (matchesKey(data, Key.enter)) {
        void this.toggle()
        return
      }
      if (matchesKey(data, Key.backspace)) {
        this.filterQuery = this.filterQuery.slice(0, -1)
        this.resyncSelection()
        return
      }
      if (this.handleNavigation(data)) return
      // A bare printable character (no escape sequence, no control byte) extends the query.
      // Anything else (function keys, unrecognized escape sequences, ...) is ignored rather
      // than accidentally injected into the filter text.
      if (data.length === 1 && data >= ' ' && data !== '\x7f') {
        this.filterQuery += data
        this.resyncSelection()
      }
      return
    }
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.actions.closePlugins()
      return
    }
    if (this.busy) return
    if (data === '/') {
      this.filtering = true
      return
    }
    if (this.handleNavigation(data)) return
    if (matchesKey(data, Key.enter)) {
      void this.toggle()
    }
  }
}
