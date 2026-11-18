/** What the frame needs to host the dock: the shared controller, the shared terminals, and which worktree is selected. */

import { useSyncExternalStore } from 'react'
import { GLOBAL_GROUP } from '../canvas/groups.ts'
import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { DockController } from './dock-controller.ts'

export interface DockHost {
  readonly controller: DockController
  readonly terminals: TerminalRegistry
  readonly shell: WorkspaceShellState
}

/** The worktree the dock follows: its tab group key and the directory a new terminal starts in. */
export function useDockTarget(host: DockHost): { readonly groupKey: string; readonly cwd: string | undefined } {
  const selected = useSyncExternalStore(
    (listener: () => void) => host.shell.subscribe(listener),
    () => host.shell.getSnapshot().selectedPath,
  )
  return { groupKey: selected ?? GLOBAL_GROUP, cwd: selected }
}
