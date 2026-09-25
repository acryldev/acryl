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
      storage.setItem(STORAGE_KEY, serializeWorkspace(shell.getSnapshot().mode, groups))
    } catch {
      // Storage full or blocked.
    }
  }
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }
  let mode = shell.getSnapshot().mode
  const offShell = shell.subscribe(() => {
    const next = shell.getSnapshot().mode
    if (next === mode) return
    mode = next
    schedule()
  })
  const offGroups = groups.onChange(schedule)
  return () => {
    offShell()
    offGroups()
    if (timer !== undefined) {
      clearTimeout(timer)
      flush()
    }
  }
}
