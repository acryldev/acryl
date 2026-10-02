/** Write the workspace's durable parts to storage when they change. */

import type { WorkspaceGroups } from './groups.ts'
import { STORAGE_KEY, serializeWorkspace, type StorageLike } from './persistence.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export interface PersistenceDeps {
  readonly groups: WorkspaceGroups
  readonly shell: WorkspaceShellState
  /** Undefined when storage is unavailable; persistence then does nothing. */
  readonly storage: StorageLike | undefined
  readonly delayMs?: number
}

/**
 * Save shortly after the last change, and once more on shutdown. Failures (a full or blocked
 * store) are ignored: this is a convenience, and must never disturb the app.
 * @returns disposer, for one owning `ctx.effect`.
 */
export function startWorkspacePersistence(deps: PersistenceDeps): () => void {
  const { groups, shell, storage } = deps
  if (storage === undefined) return () => {}
  const delay = deps.delayMs ?? 400
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = (): void => {
    timer = undefined
    try {
      storage.setItem(STORAGE_KEY, serializeWorkspace(shell.getSnapshot().mode, groups, shell.forgottenRoots(), [...shell.getSnapshot().dismissedChats]))
    } catch {
      // Storage full or blocked.
    }
  }
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }
  let mode = shell.getSnapshot().mode
  // `dismissedChats` is replaced wholesale (never mutated) on every change, so reference inequality alone
  // reliably means "really changed" - no need to diff contents (owner report, 2026-10-01: "x" on a chat
  // only lasted until the next reload, same bug `forgetRepo` had before it, same fix).
  let dismissedChats = shell.getSnapshot().dismissedChats
  const offShell = shell.subscribe(() => {
    const snapshot = shell.getSnapshot()
    const modeChanged = snapshot.mode !== mode
    const dismissedChanged = snapshot.dismissedChats !== dismissedChats
    if (!modeChanged && !dismissedChanged) return
    mode = snapshot.mode
    dismissedChats = snapshot.dismissedChats
    schedule()
  })
  const offGroups = groups.onChange(schedule)
  const offForgotten = shell.onForgottenChange(schedule)
  return () => {
    offShell()
    offGroups()
    offForgotten()
    if (timer !== undefined) {
      clearTimeout(timer)
      flush()
    }
  }
}
