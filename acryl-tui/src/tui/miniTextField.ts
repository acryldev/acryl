/**
 * A tiny hand-rolled single-line text buffer (value + cursor, insert/
 * backspace/delete/left/right/home/end) shared by the handful of overlays
 * that need one embedded field inside otherwise-custom keyboard handling
 * (`QuestionOverlay`'s free-text answer, `TrajectoryOverlay`'s filter,
 * `ProviderForm`'s fields, `ModelListEditor`'s add-id field) — replacing
 * `ink-text-input` without wrestling with pi-tui's focus model, which only
 * tracks one focused `Component` at a time and has no built-in way to
 * delegate keystrokes to a field nested inside a larger custom overlay.
 * @module @tomowang/dsh-tui/tui/miniTextField
 */

import { Key, matchesKey } from '@earendil-works/pi-tui'

export interface MiniTextFieldState {
  readonly value: string
  readonly cursor: number
}

export function emptyMiniTextField(value = ''): MiniTextFieldState {
  return { value, cursor: value.length }
}

/** Apply one keystroke, or return `undefined` if this field doesn't handle it (so the caller can fall through to its own bindings, e.g. Enter/Escape/Tab). */
export function miniTextFieldInput(state: MiniTextFieldState, data: string): MiniTextFieldState | undefined {
  if (matchesKey(data, Key.left)) return { ...state, cursor: Math.max(0, state.cursor - 1) }
  if (matchesKey(data, Key.right)) return { ...state, cursor: Math.min(state.value.length, state.cursor + 1) }
  if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl('a'))) return { ...state, cursor: 0 }
  if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl('e'))) return { ...state, cursor: state.value.length }
  if (matchesKey(data, Key.backspace)) {
    if (state.cursor === 0) return state
    return { value: state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor), cursor: state.cursor - 1 }
  }
  if (matchesKey(data, Key.delete)) {
    if (state.cursor >= state.value.length) return state
    return { value: state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1), cursor: state.cursor }
  }
  if (data.length > 0 && !data.startsWith('\x1b') && data !== '\r' && data !== '\n' && data !== '\t') {
    return { value: state.value.slice(0, state.cursor) + data + state.value.slice(state.cursor), cursor: state.cursor + data.length }
  }
  return undefined
}

/** Render the field's text, optionally with an inverse-video cursor block at the cursor position. */
export function renderMiniTextField(state: MiniTextFieldState, cursorVisible: boolean, mask?: string): string {
  const display = mask === undefined ? state.value : mask.repeat(state.value.length)
  if (!cursorVisible) return display
  const before = display.slice(0, state.cursor)
  const at = display[state.cursor] ?? ' '
  const after = display.slice(state.cursor + 1)
  return `${before}\x1b[7m${at}\x1b[0m${after}`
}
