/** One independent tab workspace per worktree, so switching branch swaps the whole set of tabs. */

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

  constructor(private readonly create: () => WorkspaceState = () => new WorkspaceState()) {}

  /** @returns the workspace for `key`, created on first use. */
  stateFor(key: string): WorkspaceState {
    let state = this.states.get(key)
    if (state === undefined) {
      state = this.create()
      this.states.set(key, state)
    }
    return state
  }

  /** @returns every group key that has been opened. */
  keys(): readonly string[] {
    return [...this.states.keys()]
  }
}
