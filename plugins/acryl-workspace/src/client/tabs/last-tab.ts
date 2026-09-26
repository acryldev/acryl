/** What the "+" button opens: the last thing the user opened from the menu (a terminal until they choose). */

export const LAST_TAB_KEY = 'acryl-workspace:last-tab'

export type LastTab =
  | { readonly kind: 'agent'; readonly id: string; readonly label: string }
  | { readonly kind: 'surface'; readonly surface: 'pty' | 'browser' | 'file' | 'diff' | 'kanban' | 'doc' }

export const DEFAULT_LAST_TAB: LastTab = { kind: 'surface', surface: 'pty' }

const SURFACES = ['pty', 'browser', 'file', 'diff', 'kanban', 'doc'] as const

export function readLastTab(storage: Pick<Storage, 'getItem'> | undefined): LastTab {
  try {
    const raw = storage?.getItem(LAST_TAB_KEY)
    if (raw === null || raw === undefined) return DEFAULT_LAST_TAB
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('kind' in value)) return DEFAULT_LAST_TAB
    if (value.kind === 'agent' && 'id' in value && typeof value.id === 'string' && 'label' in value && typeof value.label === 'string' && value.id.length <= 32 && value.label.length <= 40) {
      return { kind: 'agent', id: value.id, label: value.label }
    }
    if (value.kind === 'surface' && 'surface' in value) {
      const surface = SURFACES.find(candidate => candidate === value.surface)
      if (surface !== undefined) return { kind: 'surface', surface }
    }
  } catch {
    // Damaged storage means the default.
  }
  return DEFAULT_LAST_TAB
}

export function writeLastTab(storage: Pick<Storage, 'setItem'> | undefined, tab: LastTab): void {
  try {
    storage?.setItem(LAST_TAB_KEY, JSON.stringify(tab))
  } catch {
    // A convenience only.
  }
}
