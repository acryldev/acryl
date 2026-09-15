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

  constructor(
    private readonly tui: TUI,
    initialRows: readonly PluginRow[],
    private readonly actions: TuiActions,
  ) {
    this.rows = initialRows
  }

  invalidate(): void {}

  private listHeight(): number {
    const availableRows = Math.max(10, this.tui.terminal.rows - 1)
    const chrome = this.status === undefined ? 2 : 3 // header + footer, plus a status line when present
    return Math.max(3, availableRows - chrome)
  }

  private maxOffset(): number {
    return Math.max(0, this.rows.length - this.listHeight())
  }

  /** Keep the selected row inside the visible window, scrolling the minimum amount needed. */
  private followSelection(): void {
    const listHeight = this.listHeight()
    if (this.selected < this.scrollOffset) this.scrollOffset = this.selected
    else if (this.selected >= this.scrollOffset + listHeight) this.scrollOffset = this.selected - listHeight + 1
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxOffset()))
  }

  private async toggle(): Promise<void> {
    const row = this.rows[this.selected]
    if (row === undefined || !row.mutable || this.busy) return
    this.busy = true
    this.status = `${row.disabled ? 'Enabling' : 'Disabling'} ${row.name}...`
    this.tui.requestRender()
    const result = await this.actions.togglePlugin(row.id, row.disabled)
    this.busy = false
    this.status = result.message
    if (result.rows !== undefined) {
      this.rows = result.rows
      this.selected = Math.min(this.selected, Math.max(0, this.rows.length - 1))
      this.followSelection()
    }
    this.tui.requestRender()
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
    lines.push(muted('↑↓ select · enter toggle · esc close'))
    return lines
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.actions.closePlugins()
      return
    }
    if (this.busy) return
    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1)
      this.followSelection()
      return
    }
    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(this.rows.length - 1, this.selected + 1)
      this.followSelection()
      return
    }
    if (matchesKey(data, Key.pageUp)) {
      this.selected = Math.max(0, this.selected - this.listHeight())
      this.followSelection()
      return
    }
    if (matchesKey(data, Key.pageDown)) {
      this.selected = Math.min(this.rows.length - 1, this.selected + this.listHeight())
      this.followSelection()
      return
    }
    if (matchesKey(data, Key.enter)) {
      void this.toggle()
    }
  }
}
