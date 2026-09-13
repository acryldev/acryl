/**
 * In-terminal answerer for one `approval/request`: a tool call parked on an
 * `ask` pre-execute decision, waiting for a one-shot allow/reject. `y`/`n`/esc
 * shortcuts since this is the highest-frequency interruption.
 * @module @tomowang/dsh-tui/tui/interaction/ApprovalOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import { theme, fg } from '../theme.js'
import type { ApprovalPromptState } from './types.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const warning = fg(theme.warning)
const muted = fg(theme.muted)
const success = fg(theme.success)
const errorColor = fg(theme.error)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

const CHOICES = [
  { outcome: 'allowed-once' as const, label: 'Allow once' },
  { outcome: 'rejected' as const, label: 'Reject' },
]

export class ApprovalOverlay implements Component {
  private selected = 0

  constructor(
    private readonly approval: ApprovalPromptState,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  render(_width: number): string[] {
    const lines: string[] = [bold(warning('Approval requested'))]
    const idSuffix = this.approval.callId === undefined ? '' : muted(` (${this.approval.callId})`)
    lines.push(`Tool: ${bold(this.approval.toolName)}${idSuffix}`)
    if (this.approval.reason !== undefined) lines.push(muted(this.approval.reason))
    CHOICES.forEach((choice, index) => {
      const color = choice.outcome === 'rejected' ? errorColor : success
      const text = `${index === this.selected ? '› ' : '  '}${choice.label}`
      lines.push(color(index === this.selected ? invert(text) : text))
    })
    lines.push(muted('↑↓ select · enter confirm · y allow · n/esc reject'))
    return lines
  }

  handleInput(data: string): void {
    if (data === 'y') {
      this.actions.answerApproval('allowed-once')
      return
    }
    if (data === 'n' || matchesKey(data, Key.escape)) {
      this.actions.answerApproval('rejected')
      return
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.left)) {
      this.selected = (this.selected - 1 + CHOICES.length) % CHOICES.length
      return
    }
    if (matchesKey(data, Key.down) || matchesKey(data, Key.right)) {
      this.selected = (this.selected + 1) % CHOICES.length
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.actions.answerApproval(CHOICES[this.selected].outcome)
    }
  }
}
