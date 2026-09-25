/** One independent tab workspace per worktree, so switching branch swaps the whole set of tabs. */

import type { SavedGroup } from './persistence.ts'
import { WorkspaceState } from './state.ts'

/** The key used before any worktree is selected. */
export const GLOBAL_GROUP = ''

/**
 * Lazily created {@link WorkspaceState} per group key (a worktree path, or {@link GLOBAL_GROUP}).
 * Groups are kept for the lifetime of the canvas: leaving a branch leaves its tabs, and any
 * terminals or agents in them, running in the background until their tab is closed.
 */
export class WorkspaceGroups {
  private readonly states = new Map<string, WorkspaceState>()
  private readonly listeners = new Set<() => void>()

  /**
   * @param create - factory for a group's workspace.
   * @param saved - groups saved by a previous run; each is restored when its key is first used.
   */
  constructor(
    private readonly create: () => WorkspaceState = () => new WorkspaceState(),
    private readonly saved: Readonly<Record<string, SavedGroup>> = {},
  ) {}

  /** @returns the workspace for `key`, created on first use. */
  stateFor(key: string): WorkspaceState {
    let state = this.states.get(key)
    if (state === undefined) {
      state = this.create()
      const previous = this.saved[key]
      if (previous !== undefined) state.restore(previous.tiles, previous.active, previous.split)
      this.states.set(key, state)
      state.subscribe(() => { this.notify() })
      this.notify()
    }
    return state
  }

  /** @returns every group key that has been opened. */
  keys(): readonly string[] {
    return [...this.states.keys()]
  }

  /** Observe a group being opened or any group's tabs changing. @returns disposer. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
