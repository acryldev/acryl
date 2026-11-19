/**
 * The inspector's on/off state as a tiny external store.
 *
 * The toggle shortcut is run by DSH's own shortcut service (`ctx.shortcuts`, DSH 0.2), outside any React tree, so the command's `run`
 * flips this store and the overlay subscribes to it.
 */

export interface InspectorToggle {
  get(): boolean
  set(next: boolean): void
  toggle(): void
  subscribe(listener: () => void): () => void
}

export function createInspectorToggle(): InspectorToggle {
  let active = false
  const listeners = new Set<() => void>()
  const set = (next: boolean): void => {
    if (active === next) return
    active = next
    for (const listener of [...listeners]) listener()
  }
  return {
    get: () => active,
    set,
    toggle: () => { set(!active) },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
