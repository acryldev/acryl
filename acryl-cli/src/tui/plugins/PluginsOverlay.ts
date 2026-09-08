/**
 * `/plugins` overlay: a scrollable, read-only list of every entry in the
 * loader's tree, snapshotted once at open time (see `pluginRows()` in
 * `index.ts`) rather than kept live — the tree rarely changes mid-session,
 * and re-snapshotting on every render would fight the scroll position.
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

  constructor(
    private readonly tui: TUI,
    private readonly rows: readonly PluginRow[],
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  private listHeight(): number {
    const availableRows = Math.max(10, this.tui.terminal.rows - 1)
    const chrome = 2 // header line + footer line
    return Math.max(3, availableRows - chrome)
  }

  private maxOffset(): number {
    return Math.max(0, this.rows.length - this.listHeight())
  }

  render(_width: number): string[] {
    const listHeight = this.listHeight()
    const offset = Math.min(this.scrollOffset, this.maxOffset())
    const windowedRows = this.rows.slice(offset, offset + listHeight)
    const activeCount = this.rows.filter(row => row.state === 'active').length
    const failedCount = this.rows.filter(row => row.state === 'failed').length
    const lines: string[] = [
      bold(secondary(`Plugins (${this.rows.length}) — ${activeCount} active${failedCount === 0 ? '' : `, ${failedCount} failed`}`)),
    ]
    for (const row of windowedRows) {
      const color = rowColor(row)
      const label = color === undefined ? rowLabel(row).padEnd(8) : color(rowLabel(row).padEnd(8))
      const id = row.disabled ? muted(` ${row.id}`) : ` ${row.id}`
      lines.push(`${label}${id}${muted(` (${row.name})`)}`)
    }
    lines.push(muted('↑↓ scroll · esc close'))
    return lines
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.actions.closePlugins()
      return
    }
    const listHeight = this.listHeight()
    const maxOffset = this.maxOffset()
    if (matchesKey(data, Key.up)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1)
      return
    }
    if (matchesKey(data, Key.down)) {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1)
      return
    }
    if (matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - listHeight)
      return
    }
    if (matchesKey(data, Key.pageDown)) {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + listHeight)
    }
  }
}
