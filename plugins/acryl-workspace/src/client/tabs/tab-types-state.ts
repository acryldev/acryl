/**
 * Which tab types the "+" menu, the palette and Settings > Tabs treat as enabled. Every type is enabled by
 * default; the user turns off the ones they never use. The terminal cannot be turned off. The choice is kept in
 * the browser storage (a per-viewer convenience) and shared, so a change in Settings shows up in the menu at once.
 */

import type { WorkspaceSurfaceAction } from '../terminal/agent-commands.ts'
import { readHiddenAgents, toggleAgent, writeHiddenAgents } from './agent-visibility.ts'

/** The remembered set holds `surface:<kind>` entries. */
export const tabTypeKey = (kind: WorkspaceSurfaceAction['kind']): string => `surface:${kind}`

export class TabTypesState {
  private hidden: ReadonlySet<string>
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined) {
    this.hidden = readHiddenAgents(storage)
  }

  getSnapshot = (): ReadonlySet<string> => this.hidden

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The terminal is always enabled. */
  isEnabled(kind: WorkspaceSurfaceAction['kind']): boolean {
    return kind === 'pty' || !this.hidden.has(tabTypeKey(kind))
  }

  setEnabled(kind: WorkspaceSurfaceAction['kind'], enabled: boolean): void {
    if (kind === 'pty' || this.isEnabled(kind) === enabled) return
    this.hidden = toggleAgent(this.hidden, tabTypeKey(kind))
    writeHiddenAgents(this.storage, this.hidden)
    for (const listener of [...this.listeners]) listener()
  }

  /** @returns the surface actions the + menu and the palette offer. */
  enabled(all: readonly WorkspaceSurfaceAction[]): readonly WorkspaceSurfaceAction[] {
    return all.filter(action => this.isEnabled(action.kind))
  }
}
