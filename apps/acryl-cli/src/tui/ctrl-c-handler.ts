/**
 * Ctrl+C interrupt-then-confirm-quit state machine, factored out of
 * `TuiApp` so it's testable without constructing a real `ProcessTerminal`.
 *
 * In raw mode Ctrl+C never reaches the process as SIGINT (pi-tui's own
 * README documents this), and pi-tui's own default keybinding for a bare
 * `ctrl+c` is "copy selection", not interrupt/quit. `TuiApp` wires this
 * handler through `TUI.addInputListener`, which runs before that default
 * (and before the focused component's own `handleInput`, per
 * `TUI.handleTerminalInput`'s own dispatch order) and can return
 * `{consume: true}` to fully pre-empt it - the one place able to give
 * Ctrl+C this behavior without patching pi-tui itself.
 * @module @tomowang/dsh-tui/tui/ctrl-c-handler
 */

/** What one Ctrl+C press did, for a caller that wants to react beyond the state machine's own side effects (tests; a future status line). */
export type CtrlCOutcome = 'cancelled' | 'armed' | 'quit'

export interface CtrlCHandlerOptions {
  /** Whether a turn is currently in flight. */
  isRunning(): boolean
  /** Cancel the active turn. */
  cancel(): void
  /** Quit the session, through the same clean path `/exit` uses - never a raw `process.exit()`. */
  quit(): void
  /** Show the transient "press again" warning (`undefined` to clear it). */
  setNotice(notice: string | undefined): void
  /** How long the quit warning stays armed before an unrelated later Ctrl+C is treated as fresh. Defaults to 2000ms - the common convention across CLIs with this exact pattern. */
  quitWindowMs?: number
}

export interface CtrlCHandler {
  /** Feed one confirmed Ctrl+C press through the state machine. */
  press(): CtrlCOutcome
  /** Clear the armed warning early (e.g. on unmount, so a dangling timer doesn't outlive the session). */
  disarm(): void
}

const DEFAULT_QUIT_WINDOW_MS = 2000

/**
 * Build one Ctrl+C state machine. A bare press while a turn is running
 * cancels that turn and nothing else - it must not simultaneously arm the
 * quit warning, or a user who reflexively double-taps Ctrl+C to stop a
 * runaway turn would exit the whole session by accident, the exact failure
 * this feature exists to prevent. Once idle, the first press only arms the
 * warning; a second press within the window quits for real. The arm expires
 * on its own so a stray later Ctrl+C is treated as fresh, not as the
 * confirming second press of a warning the user has forgotten about.
 */
export function createCtrlCHandler(options: CtrlCHandlerOptions): CtrlCHandler {
  const quitWindowMs = options.quitWindowMs ?? DEFAULT_QUIT_WINDOW_MS
  let armed = false
  let armTimer: NodeJS.Timeout | undefined

  function disarm(): void {
    armed = false
    clearTimeout(armTimer)
    armTimer = undefined
  }

  function press(): CtrlCOutcome {
    if (armed) {
      disarm()
      options.quit()
      return 'quit'
    }
    if (options.isRunning()) {
      options.cancel()
      return 'cancelled'
    }
    armed = true
    options.setNotice('Press Ctrl+C again and Acryl will quit this session')
    armTimer = setTimeout(disarm, quitWindowMs)
    return 'armed'
  }

  return { press, disarm }
}
