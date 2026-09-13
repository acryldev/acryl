/**
 * `/trajectory` overlay: a turn/step-grouped ledger of the session log (see
 * `layout.ts`) with a keyboard-driven inspector panel. Owns all of its own
 * navigation/filter/collapse state locally (nothing is store-held; the
 * ledger is re-derived from the store's events on every render, per the
 * project's log-first-rendering principle).
 *
 * Keys: ↑↓ move selection, Tab/Shift+Tab cycle the detail tab, `c` toggles
 * collapsing the selected record's turn, `/` focuses a substring filter
 * (Esc there defocuses without closing), Esc closes the overlay.
 * @module @tomowang/dsh-tui/tui/trajectory/TrajectoryOverlay
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { RenderOptions } from '../../render.js'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { buildTrajectoryRows } from './layout.js'
import { buildLedgerLines } from './TrajectoryLedger.js'
import { buildDetailLines } from './TrajectoryDetail.js'
import { detailTabsFor, type TrajectoryDetailTab, type TrajectoryRecord, type TrajectoryRow } from './types.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)

type RecordRow = Extract<TrajectoryRow, { kind: 'record' }>

export class TrajectoryOverlay implements Component {
  private readonly collapsedTurns = new Set<number>()
  private filter: MiniTextFieldState = emptyMiniTextField()
  private filterFocused = false
  private detailTab: TrajectoryDetailTab = 'summary'
  private selectedId: string | undefined
  private scrollOffset = 0
  private lastSelectedTurn: number | undefined

  constructor(
    private readonly tui: TUI,
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
    private readonly getTool: RenderOptions['getTool'],
  ) {}

  invalidate(): void {}

  private heights(): { ledgerHeight: number; detailContentHeight: number } {
    const availableRows = Math.max(10, this.tui.terminal.rows - 1)
    const chrome = 4 // header line + blank line before/after the detail panel + footer/filter line
    const remaining = Math.max(6, availableRows - chrome)
    const detailContentHeight = Math.max(2, Math.floor(remaining / 2))
    const ledgerHeight = Math.max(3, remaining - detailContentHeight - 1) // -1 for the detail tab bar
    return { ledgerHeight, detailContentHeight }
  }

  private computeRows(): { filteredRows: readonly TrajectoryRow[]; records: readonly RecordRow[] } {
    const events = this.store.getSnapshot().events
    const rows = buildTrajectoryRows(events, this.collapsedTurns)
    const query = this.filter.value.trim().toLowerCase()
    const filteredRows =
      query === ''
        ? rows
        : rows.filter(row => row.kind === 'record' && (row.record.label.toLowerCase().includes(query) || row.record.summary.toLowerCase().includes(query)))
    const records = filteredRows.filter((row): row is RecordRow => row.kind === 'record')
    return { filteredRows, records }
  }

  render(width: number): string[] {
    const { filteredRows, records } = this.computeRows()
    const selectedIndex = this.selectedId === undefined ? -1 : records.findIndex(row => row.record.id === this.selectedId)
    const effectiveIndex = selectedIndex === -1 ? records.length - 1 : selectedIndex
    const selectedRecord = records[effectiveIndex]?.record
    if (selectedRecord !== undefined) this.lastSelectedTurn = selectedRecord.turn
    // A tab left active from a differently-kinded record (e.g. 'schema' from
    // a tool call) may not apply to the newly selected one — fall back to
    // Summary, which every kind has.
    if (selectedRecord !== undefined && !detailTabsFor(selectedRecord).includes(this.detailTab)) {
      this.detailTab = 'summary'
    }

    const selectedRowIndex = selectedRecord === undefined ? -1 : filteredRows.findIndex(row => row.kind === 'record' && row.record.id === selectedRecord.id)

    const { ledgerHeight, detailContentHeight } = this.heights()
    const maxOffset = Math.max(0, filteredRows.length - ledgerHeight)
    if (selectedRowIndex < this.scrollOffset) this.scrollOffset = selectedRowIndex
    else if (selectedRowIndex >= this.scrollOffset + ledgerHeight) this.scrollOffset = selectedRowIndex - ledgerHeight + 1
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset))

    const windowedRows = filteredRows.slice(this.scrollOffset, this.scrollOffset + ledgerHeight)

    const lines: string[] = [
      bold(
        secondary(
          `Trajectory${this.filter.value === '' ? '' : ` — filter: ${this.filter.value}`}${records.length === 0 ? '' : ` (${effectiveIndex + 1}/${records.length})`}`,
        ),
      ),
      ...buildLedgerLines(windowedRows, selectedRecord?.id),
      '',
      ...buildDetailLines(selectedRecord, this.detailTab, detailContentHeight, this.getTool, width),
      '',
    ]
    if (this.filterFocused) {
      lines.push(`/ ${renderMiniTextField(this.filter, true)}`)
    } else {
      lines.push(muted('↑↓ select · tab detail · c collapse · / filter · esc close'))
    }
    return lines
  }

  private moveSelection(delta: number): void {
    const { records } = this.computeRows()
    if (records.length === 0) return
    const selectedIndex = this.selectedId === undefined ? -1 : records.findIndex(row => row.record.id === this.selectedId)
    const effectiveIndex = selectedIndex === -1 ? records.length - 1 : selectedIndex
    const next = Math.min(records.length - 1, Math.max(0, effectiveIndex + delta))
    this.selectedId = records[next].record.id
  }

  private selectedRecord(): TrajectoryRecord | undefined {
    const { records } = this.computeRows()
    const selectedIndex = this.selectedId === undefined ? -1 : records.findIndex(row => row.record.id === this.selectedId)
    const effectiveIndex = selectedIndex === -1 ? records.length - 1 : selectedIndex
    return records[effectiveIndex]?.record
  }

  private cycleTab(delta: number): void {
    const record = this.selectedRecord()
    if (record === undefined) return
    const tabs = detailTabsFor(record)
    const index = tabs.indexOf(this.detailTab)
    const next = ((index === -1 ? 0 : index) + delta + tabs.length) % tabs.length
    this.detailTab = tabs[next]
  }

  private toggleCollapse(): void {
    const turn = this.selectedRecord()?.turn ?? this.lastSelectedTurn
    if (turn === undefined) return
    if (this.collapsedTurns.has(turn)) this.collapsedTurns.delete(turn)
    else this.collapsedTurns.add(turn)
  }

  handleInput(data: string): void {
    if (this.filterFocused) {
      if (matchesKey(data, Key.escape)) {
        this.filterFocused = false
        return
      }
      if (matchesKey(data, Key.enter)) {
        this.filterFocused = false
        return
      }
      const next = miniTextFieldInput(this.filter, data)
      if (next !== undefined) this.filter = next
      return
    }
    if (matchesKey(data, Key.escape)) {
      this.actions.closeTrajectory()
      return
    }
    if (matchesKey(data, Key.up)) {
      this.moveSelection(-1)
      return
    }
    if (matchesKey(data, Key.down)) {
      this.moveSelection(1)
      return
    }
    if (matchesKey(data, 'shift+tab')) {
      this.cycleTab(-1)
      return
    }
    if (matchesKey(data, Key.tab)) {
      this.cycleTab(1)
      return
    }
    if (data === 'c') {
      this.toggleCollapse()
      return
    }
    if (data === '/') {
      this.filterFocused = true
    }
  }
}
