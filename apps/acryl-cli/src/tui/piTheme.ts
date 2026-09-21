/**
 * Adapts this app's `theme.ts` hex-token table to the color-function shapes
 * pi-tui's built-in components (`Editor`, `SelectList`) expect.
 * @module @tomowang/dsh-tui/tui/piTheme
 */

import type { EditorTheme } from '@earendil-works/pi-tui'
import type { SelectListTheme } from '@earendil-works/pi-tui'
import { fgRole } from './theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`

export const selectListTheme: SelectListTheme = {
  selectedPrefix: fgRole('primary'),
  selectedText: (s: string) => bold(fgRole('primary')(s)),
  description: fgRole('muted'),
  scrollInfo: fgRole('muted'),
  noMatch: fgRole('muted'),
}

export const editorTheme: EditorTheme = {
  borderColor: fgRole('primary'),
  selectList: selectListTheme,
}

export const shellModeEditorBorderColor = fgRole('warning')
