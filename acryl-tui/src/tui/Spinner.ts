/**
 * Braille frame-cycling spinner, embedded inline in the status bar text.
 * The only component with genuine self-driven animation state independent
 * of `TuiStore` — mirrors pi-tui's own `Loader` component's pattern (owns
 * its `tui` reference, drives its own timer, calls `requestRender()` itself)
 * rather than relying on a React re-render loop that no longer exists.
 * @module @tomowang/dsh-tui/tui/Spinner
 */

import type { TUI } from '@earendil-works/pi-tui'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const INTERVAL_MS = 80

export class Spinner {
  private frame = 0
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly tui: TUI) {}

  current(): string {
    return FRAMES[this.frame]
  }

  start(): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length
      this.tui.requestRender()
    }, INTERVAL_MS)
  }

  stop(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }
}
