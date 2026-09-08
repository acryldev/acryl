/**
 * Adapts this app's `theme.ts` hex-token table to the color-function shapes
 * pi-tui's built-in components (`Editor`, `SelectList`) expect.
 * @module @tomowang/dsh-tui/tui/piTheme
 */

import type { EditorTheme } from '@earendil-works/pi-tui'
import type { SelectListTheme } from '@earendil-works/pi-tui'
import { theme, fg } from './theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`

export const selectListTheme: SelectListTheme = {
  selectedPrefix: fg(theme.primary),
  selectedText: (s: string) => bold(fg(theme.primary)(s)),
  description: fg(theme.muted),
  scrollInfo: fg(theme.muted),
  noMatch: fg(theme.muted),
}

export const editorTheme: EditorTheme = {
  borderColor: fg(theme.primary),
  selectList: selectListTheme,
}

export const shellModeEditorBorderColor = fg(theme.warning)
