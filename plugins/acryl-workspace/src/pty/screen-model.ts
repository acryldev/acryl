/**
 * The Host's own picture of one terminal's screen.
 *
 * It is fed the same bytes the process writes, so at any moment it can say exactly what is on screen
 * (including a full-screen program's alternate screen, colours, and cursor position). A view that attaches
 * late, reconnects after a long gap, or reloads is given that picture instead of a replay of raw history,
 * which cannot reproduce a screen that was drawn by cursor movement.
 */

import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal } from '@xterm/headless'

const SCROLLBACK_LINES = 5000

export interface ScreenSnapshot {
  /** Escape sequences that redraw the screen and scrollback from empty. */
  readonly screen: string
  /** The cursor of the output this snapshot already includes. Anything after it is still to be sent. */
  readonly cursor: number
}

export class ScreenModel {
  private readonly terminal: Terminal
  private readonly serializer = new SerializeAddon()
  private applied = 0

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({ cols, rows, scrollback: SCROLLBACK_LINES, allowProposedApi: true })
    this.terminal.loadAddon(this.serializer)
  }

  /** @param endCursor - the output cursor after this chunk, so a snapshot can say how far it reaches. */
  write(chunk: string, endCursor: number): void {
    // The terminal parses asynchronously; the snapshot only claims what the parser has really reached.
    this.terminal.write(chunk, () => { this.applied = endCursor })
  }

  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows)
  }

  snapshot(): ScreenSnapshot {
    return { screen: this.serializer.serialize(), cursor: this.applied }
  }

  dispose(): void {
    this.terminal.dispose()
  }
}
