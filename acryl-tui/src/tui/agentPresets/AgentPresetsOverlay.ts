/**
 * `/presets` overlay: the deployment's agent-preset roster, with the
 * session's current preset marked. Cursor lives in the store (`selected`),
 * matching `ProviderList`'s pattern. A switch is only accepted while the
 * session is blank (no turn has run yet); the host enforces that too, so
 * this is a UX guard, not the only guard.
 * @module @tomowang/dsh-tui/tui/agentPresets/AgentPresetsOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

export class AgentPresetsOverlay implements Component {
  constructor(
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  render(_width: number): string[] {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'agentPresets') return []
    const { rows, selected, current, blank, busy, error } = overlay.agentPresets
    const lines: string[] = [bold(secondary('Agent presets'))]
    if (error !== undefined) lines.push(errorColor(error))
    if (busy && rows.length === 0) lines.push(muted('Loading…'))
    rows.forEach((row, index) => {
      const marker = row.id === current ? '● ' : '○ '
      const trust = row.trust === 'user' ? ' (custom)' : ''
      const row0 = `${index === selected ? '› ' : '  '}${marker}${row.label}${trust}`
      lines.push(index === selected ? invert(row0) : row0)
      if (row.broken !== undefined) lines.push(errorColor(`    broken: ${row.broken}`))
      else if (row.description !== undefined) lines.push(muted(`    ${row.description}`))
    })
    if (rows.length === 0 && !busy) lines.push(muted('No agent presets configured in this profile.'))
    lines.push(muted(blank ? '↑↓ select · enter apply · esc close' : 'session already started — preset is fixed · esc close'))
    return lines
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'agentPresets') return
    const { rows, selected, blank } = overlay.agentPresets
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.actions.closeAgentPresets()
      return
    }
    if (rows.length === 0) return
    if (matchesKey(data, Key.up)) {
      this.actions.selectAgentPresetRow(Math.max(0, selected - 1))
      return
    }
    if (matchesKey(data, Key.down)) {
      this.actions.selectAgentPresetRow(Math.min(rows.length - 1, selected + 1))
      return
    }
    if (matchesKey(data, Key.enter) && blank) {
      const row = rows[selected]
      if (row.broken === undefined) this.actions.applyAgentPreset(row.id)
    }
  }
}
