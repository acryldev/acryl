/**
 * `/context` overlay: a static panel showing context-window occupancy and its
 * System prompt / Tools / Messages composition. No scrolling or selection
 * state — a fixed read of `state.stats`, refreshed every render.
 * @module @tomowang/dsh-tui/tui/context/ContextOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { contextBreakdownRows, contextOccupancy, formatTokens } from '../statsFormat.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)

const BAR_WIDTH = 30

function bar(widthPercent: number): string {
  const filled = Math.round((widthPercent / 100) * BAR_WIDTH)
  return '█'.repeat(Math.max(0, Math.min(BAR_WIDTH, filled))).padEnd(BAR_WIDTH, '░')
}

export class ContextOverlay implements Component {
  constructor(
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  render(_width: number): string[] {
    const { contextPressure, contextBreakdown } = this.store.getSnapshot().stats
    const occupancy = contextOccupancy(contextPressure)
    const rows = contextBreakdownRows(occupancy, contextBreakdown)
    const lines: string[] = [bold(secondary('Context usage'))]
    if (occupancy === null) {
      lines.push(muted('No usage reported yet — send a message first.'))
    } else {
      lines.push(`${occupancy.percent}% of context used`)
      lines.push(muted(`~${formatTokens(occupancy.usedTokens)} / ${formatTokens(occupancy.contextWindow)}`))
      lines.push('')
      if (rows.length === 0) {
        lines.push(muted('No composition breakdown yet.'))
      } else {
        for (const row of rows) {
          lines.push(`${row.label.padEnd(14)} ${secondary(bar(row.width))} ${formatTokens(row.tokens)}`)
        }
      }
    }
    lines.push('')
    lines.push(muted('esc close'))
    return lines
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.actions.closeContext()
      return
    }
  }
}
