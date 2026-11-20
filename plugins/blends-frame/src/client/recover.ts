/**
 * The page recovers by itself from one known failure: while the app's rows reload after an agent's edit, DSH's slot assembly can render a scope
 * before its adapter is back (`SlotAssemblyError: scope '...' rendered without an installed adapter`, seen on Windows) and React unmounts the whole
 * page, leaving it blank although the host and the edit are fine. A reload brings it back with the edit; this does that reload, at most once in
 * RELOAD_GAP_MS, and only for that error.
 */

export const RELOAD_GAP_MS = 15_000
const KEY = 'acrylBlends.recoveredAt'
const KNOWN = /rendered without an installed adapter/u

/** Whether an error is the known one a reload cures. */
export function isRecoverable(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return KNOWN.test(text)
}

export interface RecoverWindow {
  addEventListener(type: 'error' | 'unhandledrejection', listener: (event: { error?: unknown; reason?: unknown; message?: string }) => void): void
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (event: { error?: unknown; reason?: unknown; message?: string }) => void): void
  readonly sessionStorage: Pick<Storage, 'getItem' | 'setItem'>
  readonly location: { reload(): void }
}

/** Install the recovery; returns its disposer. */
export function installRecovery(target: RecoverWindow, now: () => number = Date.now): () => void {
  const listener = (event: { error?: unknown; reason?: unknown; message?: string }): void => {
    if (!isRecoverable(event.error ?? event.reason ?? event.message)) return
    let last = 0
    try { last = Number(target.sessionStorage.getItem(KEY) ?? 0) } catch { /* storage refused: still reload once */ }
    if (now() - last < RELOAD_GAP_MS) return
    try { target.sessionStorage.setItem(KEY, String(now())) } catch { /* the gap then only holds for this page */ }
    target.location.reload()
  }
  target.addEventListener('error', listener)
  target.addEventListener('unhandledrejection', listener)
  return () => {
    target.removeEventListener('error', listener)
    target.removeEventListener('unhandledrejection', listener)
  }
}
