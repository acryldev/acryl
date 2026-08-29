/**
 * In-terminal answerer for one question from `ctx.userQuestions`: the
 * `ask_user_question` tool, or `dsh-plan-mode`'s `exit_plan_mode` review
 * (`approveLabel` set). A cursor moves over the offered options plus a
 * trailing "Other…" row that opens a free-text field; a request with no
 * options starts directly in that field. Space toggles a row for a
 * multi-select question; Enter always submits the current toggled/typed
 * answer.
 * @module @tomowang/dsh-tui/tui/interaction/QuestionOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import { theme, fg } from '../theme.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
import type { QuestionPromptState } from './types.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

/** Detail (e.g. a plan-review's plan markdown) line cap. */
const MAX_DETAIL_LINES = 60

function capDetailLines(detail: string): string[] {
  const lines = detail.split('\n')
  if (lines.length <= MAX_DETAIL_LINES) return lines
  const omitted = lines.length - MAX_DETAIL_LINES
  return [...lines.slice(0, MAX_DETAIL_LINES), `… +${omitted} more line${omitted === 1 ? '' : 's'}`]
}

export class QuestionOverlay implements Component {
  private cursor = 0
  private readonly toggled = new Set<number>()
  private customMode: boolean
  private customField: MiniTextFieldState = emptyMiniTextField()

  constructor(
    private readonly question: QuestionPromptState,
    private readonly actions: TuiActions,
  ) {
    this.customMode = question.options.length === 0
  }

  invalidate(): void {}

  private submit(): void {
    const custom = this.customField.value.trim()
    if (this.question.multiSelect) {
      const selected = [...this.toggled].sort((a, b) => a - b).map(index => this.question.options[index].label)
      this.actions.answerQuestion({ selected, custom: custom === '' ? undefined : custom })
      return
    }
    if (this.customMode) {
      this.actions.answerQuestion({ selected: [], custom })
      return
    }
    this.actions.answerQuestion({ selected: [this.question.options[this.cursor].label], custom: undefined })
  }

  render(_width: number): string[] {
    const { header, question: text, detail, options, multiSelect, approveLabel, progress } = this.question
    const otherIndex = options.length
    const lines: string[] = []
    lines.push(bold(secondary(`${header ?? 'Question'}${progress === undefined ? '' : ` — ${progress}`}`)))
    lines.push(text)
    if (detail !== undefined) {
      lines.push('')
      for (const line of capDetailLines(detail)) lines.push(muted(line))
      lines.push('')
    }
    options.forEach((option, index) => {
      const isSelected = !this.customMode && this.cursor === index
      const box = multiSelect ? (this.toggled.has(index) ? '[x] ' : '[ ] ') : ''
      const approve = approveLabel === option.label ? ' (approve)' : ''
      const row = `${isSelected ? '› ' : '  '}${box}${option.label}${approve}`
      lines.push(isSelected ? invert(row) : row)
      if (option.description !== undefined) lines.push(muted(`    ${option.description}`))
    })
    if (options.length > 0) {
      const isSelected = !this.customMode && this.cursor === otherIndex
      const row = `${isSelected ? '› ' : '  '}Other…`
      lines.push(isSelected ? invert(row) : row)
    }
    if (this.customMode) {
      lines.push(`> ${renderMiniTextField(this.customField, true)}`)
    }
    const hint = [
      multiSelect ? '↑↓ move · space toggle · enter submit' : '↑↓ move · enter select',
      options.length === 0 ? '' : '"Other…" for free text',
      'esc skip',
    ]
      .filter(s => s !== '')
      .join(' · ')
    lines.push(muted(hint))
    return lines
  }

  handleInput(data: string): void {
    const { options, multiSelect } = this.question
    const otherIndex = options.length

    if (this.customMode) {
      if (matchesKey(data, Key.escape)) {
        if (options.length > 0) this.customMode = false
        else this.actions.answerQuestion({ selected: [], custom: undefined })
        return
      }
      if (matchesKey(data, Key.enter)) {
        this.submit()
        return
      }
      const next = miniTextFieldInput(this.customField, data)
      if (next !== undefined) this.customField = next
      return
    }

    if (matchesKey(data, Key.escape)) {
      this.actions.answerQuestion({ selected: [], custom: undefined })
      return
    }
    if (options.length === 0) return
    if (matchesKey(data, Key.up)) {
      this.cursor = (this.cursor - 1 + options.length + 1) % (options.length + 1)
      return
    }
    if (matchesKey(data, Key.down)) {
      this.cursor = (this.cursor + 1) % (options.length + 1)
      return
    }
    if (data === ' ' && multiSelect && this.cursor < options.length) {
      if (this.toggled.has(this.cursor)) this.toggled.delete(this.cursor)
      else this.toggled.add(this.cursor)
      return
    }
    if (matchesKey(data, Key.enter)) {
      if (this.cursor === otherIndex) {
        this.customMode = true
        return
      }
      this.submit()
    }
  }
}
