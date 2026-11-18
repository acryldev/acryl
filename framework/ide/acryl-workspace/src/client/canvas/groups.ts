/**
 * One independent tab workspace per worktree and per shown workspace (spec 043 Q2), so switching branch, or switching
 * workspace, swaps the whole set of tabs.
 */

import { DEFAULT_WORKSPACE_ID } from '../../projects/contract.ts'
import type { SavedGroup } from './persistence.ts'
import { WorkspaceState } from './state.ts'

/** The key used before any worktree is selected. */
export const GLOBAL_GROUP = ''

/** Separates the workspace from the worktree in a saved key; a key without it was saved before workspaces and is Default's. */
const SCOPE_SEPARATOR = '\u0000'

/** The key a group is saved under: the worktree alone for Default (as before workspaces), else workspace and worktree. */
export function savedGroupKey(workspace: string, worktree: string): string {
  return workspace === DEFAULT_WORKSPACE_ID ? worktree : `${workspace}${SCOPE_SEPARATOR}${worktree}`
}

/** Where a saved key's tab set lives: its workspace and worktree. */
export function groupLocation(savedKey: string): { readonly workspace: string, readonly worktree: string } {
  const at = savedKey.indexOf(SCOPE_SEPARATOR)
  return at === -1 ? { workspace: DEFAULT_WORKSPACE_ID, worktree: savedKey } : { workspace: savedKey.slice(0, at), worktree: savedKey.slice(at + 1) }
}

/**
 * Lazily created {@link WorkspaceState} per worktree key (a worktree path, or {@link GLOBAL_GROUP}) in the shown workspace.
 * Groups are kept for the lifetime of the canvas: leaving a branch or a workspace leaves its tabs, and any terminals or
 * agents in them, running in the background until their tab is closed.
 */
export class WorkspaceGroups {
  private readonly states = new Map<string, WorkspaceState>()
  private readonly listeners = new Set<() => void>()
  private scope = DEFAULT_WORKSPACE_ID

  /**
   * @param create - factory for a group's workspace.
   * @param saved - groups saved by a previous run, by {@link savedGroupKey}; each is restored when its key is first used.
   */
  constructor(
    private readonly create: () => WorkspaceState = () => new WorkspaceState(),
    private readonly saved: Readonly<Record<string, SavedGroup>> = {},
  ) {}

  /** The workspace whose tab sets {@link stateFor} and {@link keys} answer for. */
  workspace(): string {
    return this.scope
  }

  /** Show another workspace's tab sets. */
  setWorkspace(id: string): void {
    if (id === this.scope) return
    this.scope = id
    this.notify()
  }

  /** @returns the shown workspace's tab set for `worktree`, created on first use. */
  stateFor(worktree: string): WorkspaceState {
    const key = savedGroupKey(this.scope, worktree)
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

  /** @returns every worktree key opened in the shown workspace. */
  keys(): readonly string[] {
    const prefix = this.scope === DEFAULT_WORKSPACE_ID ? undefined : `${this.scope}${SCOPE_SEPARATOR}`
    const keys: string[] = []
    for (const key of this.states.keys()) {
      if (prefix === undefined ? !key.includes(SCOPE_SEPARATOR) : key.startsWith(prefix)) keys.push(prefix === undefined ? key : key.slice(prefix.length))
    }
    return keys
  }

  /** @returns every opened tab set in every workspace, by its saved key (for saving, and for a terminal found by id wherever its tab is). */
  entries(): readonly (readonly [string, WorkspaceState])[] {
    return [...this.states.entries()]
  }

  /** @returns the saved tab sets no {@link stateFor} has opened yet, by saved key (kept as they were when saving). */
  unopened(): Readonly<Record<string, SavedGroup>> {
    return Object.fromEntries(Object.entries(this.saved).filter(([key]) => !this.states.has(key)))
  }

  /** Observe the shown workspace changing, a group being opened, or any group's tabs changing. @returns disposer. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
