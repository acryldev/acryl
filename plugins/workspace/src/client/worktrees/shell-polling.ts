/** Keep the shell's git state fresh while the window is visible. */

import type { WorkspaceShellState } from './shell-state.ts'

/** Milliseconds between refreshes of every known worktree's status. */
export const SHELL_POLL_INTERVAL_MS = 5000

/**
 * Start refreshing on an interval, on window focus, and when the page becomes visible.
 * Hidden pages do no work. Owned by one `ctx.effect`; the returned disposer stops it and
 * disposes the shell.
 */
export function startShellPolling(shell: WorkspaceShellState): () => void {
  const tick = (): void => {
    if (document.visibilityState === 'hidden') return
    void shell.refreshAll()
  }
  const timer = setInterval(tick, SHELL_POLL_INTERVAL_MS)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
    shell.dispose()
  }
}
