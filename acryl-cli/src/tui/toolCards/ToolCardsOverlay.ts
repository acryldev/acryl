/**
 * Mutable inspector for tool cards, opened by Ctrl+O/`/tools`: every row
 * shows its full, uncapped presentation (`formatToolCardDetail`) by
 * default, scrollable, rather than the transcript's collapsed one-line
 * summary — `Enter`/`Space` collapses a row back down, per-row.
 * @module @tomowang/dsh-tui/tui/toolCards/ToolCardsOverlay
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { CallId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { formatToolCardDetail, formatToolCardSummary, type RenderOptions } from '../../render.js'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)

/**
 * One row of the overlay: a `tool/call` and its `tool/result`, paired by
 * `callId` so a call/result pair reads as one entry instead of two — mirrors
 * how the transcript itself collapses the pair into a single line.
 * `result` is `undefined` while the call is still pending; `call` is
 * `undefined` only for a `tool/result` whose `tool/call` fell outside the
 * log (e.g. truncation), which still needs a row of its own.
 */
interface ToolCardRow {
  readonly call: SessionEvent | undefined
  readonly result: SessionEvent | undefined
}

/** Stable identity for a row across its pending → resolved transition — the call's own `seq` when there is one, so `collapsed`/scroll state survives its result landing. */
function rowKey(row: ToolCardRow): number {
  return (row.call ?? row.result)!.seq
}

function summaryOf(row: ToolCardRow, options: RenderOptions): string {
  if (row.result !== undefined) return formatToolCardSummary(row.result, options)
  if (row.call !== undefined) return formatToolCardSummary(row.call, options)
  return ''
}

/** Full detail for a row: the call's presentation, then the result's, blank-line separated when both are present. */
function detailOf(row: ToolCardRow, options: RenderOptions): string[] {
  const callLines = row.call === undefined ? [] : formatToolCardDetail(row.call, options)
  const resultLines = row.result === undefined ? [] : formatToolCardDetail(row.result, options)
  if (callLines.length === 0) return resultLines
  if (resultLines.length === 0) return callLines
  return [...callLines, '', ...resultLines]
}

export class ToolCardsOverlay implements Component {
  private selected: number | undefined
  // Rows expand by default; this tracks the opt-out (a row the reader
  // explicitly collapsed), inverted from an "expanded" allowlist so a fresh
  // call/result pair shows full detail immediately instead of needing an
  // Enter/Space per row.
  private readonly collapsed = new Set<number>()
  private scrollOffset = 0
  private lastRowKey: number | undefined
  private lastOpen = false

  constructor(
    private readonly tui: TUI,
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
    private readonly getTool: RenderOptions['getTool'],
    private readonly getToolCall: RenderOptions['getToolCall'],
  ) {}

  invalidate(): void {}

  /** Pairs `tool/call`/`tool/result` events by `callId`, in call order; an orphaned result (no call in the log) gets its own trailing row. */
  private cards(): ToolCardRow[] {
    const rows: ToolCardRow[] = []
    const indexByCallId = new Map<CallId, number>()
    for (const event of this.store.getSnapshot().events) {
      if (event.type === 'tool/call') {
        indexByCallId.set(event.data.callId, rows.length)
        rows.push({ call: event, result: undefined })
      } else if (event.type === 'tool/result') {
        const index = indexByCallId.get(event.data.message.source.callId)
        if (index === undefined) rows.push({ call: undefined, result: event })
        else rows[index] = { ...rows[index], result: event }
      }
    }
    return rows
  }

  private contentRows(): number {
    const availableRows = Math.max(6, this.tui.terminal.rows - 1)
    const chrome = 4 // header, position/scroll line, blank separator, footer
    return Math.max(1, availableRows - chrome)
  }

  render(_width: number): string[] {
    const cards = this.cards()
    const index = cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1)
    const row = cards[index]
    const key = row === undefined ? undefined : rowKey(row)
    const open = key !== undefined && !this.collapsed.has(key)

    // A newly selected or newly opened card always starts scrolled to its top.
    if (key !== this.lastRowKey || open !== this.lastOpen) {
      this.scrollOffset = 0
      this.lastRowKey = key
      this.lastOpen = open
    }

    const options: RenderOptions = { replay: false, getTool: this.getTool, getToolCall: this.getToolCall }
    const contentRows = this.contentRows()
    const summary = row === undefined ? undefined : summaryOf(row, options)
    const detailLines = row === undefined || !open ? undefined : detailOf(row, options)
    const totalDetailLines = detailLines?.length ?? 0
    const maxScrollOffset = Math.max(0, totalDetailLines - contentRows)
    const clampedOffset = Math.min(this.scrollOffset, maxScrollOffset)
    const visibleDetailLines = detailLines?.slice(clampedOffset, clampedOffset + contentRows)

    const scrollHint =
      totalDetailLines <= contentRows
        ? ''
        : ` · lines ${clampedOffset + 1}-${Math.min(totalDetailLines, clampedOffset + contentRows)} of ${totalDetailLines}`

    const lines: string[] = [
      bold(secondary(`Tool Cards${cards.length === 0 ? '' : ` (${index + 1}/${cards.length})`}${open ? scrollHint : ''}`)),
    ]
    if (row === undefined) {
      lines.push(muted('No tool cards in this session yet.'))
    } else if (open) {
      lines.push(...(visibleDetailLines ?? []))
    } else {
      lines.push(`▸ ${summary ?? ''}`)
    }
    lines.push('')
    lines.push(
      muted(`↑↓ select · PgUp/PgDn/Home/End scroll · Enter/Space ${open ? 'collapse' : 'expand'} · Ctrl+O/Esc close`),
    )
    return lines
  }

  private move(delta: number): void {
    const cards = this.cards()
    if (cards.length === 0) return
    const current = this.selected ?? cards.length - 1
    this.selected = Math.max(0, Math.min(cards.length - 1, current + delta))
  }

  private scroll(delta: number, maxScrollOffset: number): void {
    this.scrollOffset = Math.max(0, Math.min(maxScrollOffset, this.scrollOffset + delta))
  }

  private toggle(): void {
    const cards = this.cards()
    const index = cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1)
    const row = cards[index]
    if (row === undefined) return
    const key = rowKey(row)
    if (this.collapsed.has(key)) this.collapsed.delete(key)
    else this.collapsed.add(key)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('o')) || data === 'q') {
      this.actions.closeToolCards()
      return
    }
    const cards = this.cards()
    const index = cards.length === 0 ? 0 : Math.min(this.selected ?? cards.length - 1, cards.length - 1)
    const row = cards[index]
    const key = row === undefined ? undefined : rowKey(row)
    const open = key !== undefined && !this.collapsed.has(key)
    const contentRows = this.contentRows()
    const options: RenderOptions = { replay: false, getTool: this.getTool, getToolCall: this.getToolCall }
    const detailLines = row === undefined || !open ? undefined : detailOf(row, options)
    const maxScrollOffset = Math.max(0, (detailLines?.length ?? 0) - contentRows)

    // Every row is expanded by default, so ↑↓ has to stay "move between
    // cards" rather than "scroll the open card" (its old, closed-only
    // meaning) — otherwise arrow-key browsing would be unreachable without
    // first collapsing each card. Scrolling long content lives on its own
    // keys instead.
    if (matchesKey(data, Key.pageUp)) return this.scroll(-contentRows, maxScrollOffset)
    if (matchesKey(data, Key.pageDown)) return this.scroll(contentRows, maxScrollOffset)
    if (matchesKey(data, Key.home)) return this.scroll(-maxScrollOffset, maxScrollOffset)
    if (matchesKey(data, Key.end)) return this.scroll(maxScrollOffset, maxScrollOffset)
    if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl('p'))) {
      this.move(-1)
      return
    }
    if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl('n'))) {
      this.move(1)
      return
    }
    if (matchesKey(data, Key.enter) || data === ' ') this.toggle()
  }
}
