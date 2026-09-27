/**
 * The registry of tab types that plugins add to the workspace (spec 040 T125, design in
 * `specs/040-agentic-multiplexer-ade/design-phase-10.md`). A plugin registers a type with a stable, namespaced
 * kind; the workspace lists it in the "+" menu, the palette and Settings > Tabs, renders its component in a tab
 * and saves the tab's state with the workspace. Provided to other client plugins as the `workspaceTabs` service.
 */

import type { ComponentType } from 'react'

/** What a tab type's component receives. It owns nothing else: the workspace owns the tab. */
export interface WorkspaceTabProps {
  readonly tileId: string
  readonly title: string
  /** The tab's saved state (text; JSON is the convention), or undefined for a new tab. */
  readonly state: string | undefined
  /** Replace the saved state. It is written with the workspace shortly after. */
  setState(next: string): void
  /** Rename the tab. */
  setTitle(title: string): void
}

export interface WorkspaceTabType {
  /** Stable and namespaced: `<owner>.<name>`, lowercase letters, digits and dashes (`acme.whiteboard`). */
  readonly kind: string
  /** The name in the "+" menu, `New <label>` is not added for you. */
  readonly label: string
  /** One sentence for Settings > Tabs. */
  readonly description: string
  /** One or two characters shown on the tab. */
  readonly glyph: string
  readonly component: ComponentType<WorkspaceTabProps>
}

export class TabTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TabTypeError'
  }
}

export const TAB_KIND_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/
export const MAX_TAB_KIND_LENGTH = 80
export const MAX_TAB_STATE_LENGTH = 200_000

/** @throws TabTypeError naming the first rule the type breaks. */
export function validateTabType(type: WorkspaceTabType): void {
  if (type.kind.length > MAX_TAB_KIND_LENGTH || !TAB_KIND_PATTERN.test(type.kind)) throw new TabTypeError(`the kind "${type.kind}" must look like owner.name (lowercase letters, digits and dashes)`)
  if (type.label.trim() === '' || [...type.label].length > 30) throw new TabTypeError('the label must be 1 to 30 characters')
  if (type.description.length > 200) throw new TabTypeError('the description is at most 200 characters')
  if ([...type.glyph].length < 1 || [...type.glyph].length > 2) throw new TabTypeError('the glyph is one or two characters')
}

/** Observable list of the registered tab types, in registration order. */
export class WorkspaceTabRegistry {
  private types: readonly WorkspaceTabType[] = []
  private readonly listeners = new Set<() => void>()

  /** A new array on every change, so it is safe as a `useSyncExternalStore` snapshot. */
  getSnapshot = (): readonly WorkspaceTabType[] => this.types

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get(kind: string): WorkspaceTabType | undefined {
    return this.types.find(type => type.kind === kind)
  }

  /**
   * @returns disposer that removes exactly this registration (idempotent).
   * @throws TabTypeError for an invalid type or a kind that is already registered.
   */
  register(type: WorkspaceTabType): () => void {
    validateTabType(type)
    if (this.get(type.kind) !== undefined) throw new TabTypeError(`the tab type "${type.kind}" is already registered`)
    this.types = [...this.types, type]
    this.notify()
    return () => {
      if (this.types.includes(type)) {
        this.types = this.types.filter(candidate => candidate !== type)
        this.notify()
      }
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
