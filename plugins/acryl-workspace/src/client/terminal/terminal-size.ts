/** A first guess at how many columns and rows a pane will hold, before the terminal is on screen to measure. */

import { MAX_PTY_COLS, MAX_PTY_ROWS } from '../../pty/contract.ts'
import type { TerminalSize } from './pty-api.ts'

/** Cell size of the terminal font at 13px, and the pane's padding around the text. */
const CELL_WIDTH = 7.8
const CELL_HEIGHT = 15.5
const PADDING_X = 20
const PADDING_Y = 16
/** Chrome above the terminal (the toolbar); the pane gives the terminal what is left. */
const TOOLBAR_HEIGHT = 30

/**
 * @returns the estimated size, or undefined when the area is unknown or too small to be a real pane.
 * The real size is sent as soon as the terminal is measured; this only makes the first frame close.
 */
export function estimateTerminalSize(widthPx: number, heightPx: number): TerminalSize | undefined {
  const cols = Math.floor((widthPx - PADDING_X) / CELL_WIDTH)
  const rows = Math.floor((heightPx - TOOLBAR_HEIGHT - PADDING_Y) / CELL_HEIGHT)
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 20 || rows < 5) return undefined
  return { cols: Math.min(cols, MAX_PTY_COLS), rows: Math.min(rows, MAX_PTY_ROWS) }
}
