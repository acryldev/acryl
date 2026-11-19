/**
 * What Settings > Shortcuts lists and how a recorded key press becomes a binding, with no page: the section renders these and DSH's shortcut
 * service (`ctx.shortcuts`) stays the only store. DSH's own "Edit shortcuts" dialog edits the same service, so both always agree.
 */

import type { ShortcutBinding, ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry, Shortcuts } from '@acryl/ui/frame'

/** One listed shortcut. `editable` rows can be recorded, cleared and reset; built-in text editing and menu keys cannot. */
export interface ShortcutRow {
  readonly id: string
  readonly label: string
  readonly keys: readonly string[]
  readonly editable: boolean
  /** Changed from its default. */
  readonly modified: boolean
  /** Why the binding cannot run (another command has the same keys), for an editable row. */
  readonly problem: string | null
}

export interface ShortcutGroup {
  readonly title: string
  readonly rows: readonly ShortcutRow[]
}

const isAcryl = (id: string): boolean => id.startsWith('acryl')

/** @returns the groups to show for `query` (matched against names, aliases and keys); empty groups are left out. */
export function shortcutGroups(catalog: readonly ShortcutCatalogEntry[], fixed: readonly ShortcutFixedCatalogEntry[], query: string): ShortcutGroup[] {
  const needle = query.trim().toLowerCase()
  const label = (id: ShortcutCommandId): string => catalog.find(entry => entry.id === id)?.label ?? fixed.find(entry => entry.id === id)?.label ?? id
  const matches = (words: readonly string[]): boolean => needle === '' || words.some(word => word.toLowerCase().includes(needle))
  const editable = (entry: ShortcutCatalogEntry): ShortcutRow => ({
    id: entry.id,
    label: entry.label,
    keys: entry.keys,
    editable: true,
    modified: entry.modified,
    problem: entry.conflicts.length > 0 ? `Also used by ${entry.conflicts.map(label).join(', ')}, so neither runs` : null,
  })
  const listed = catalog.filter(entry => matches([entry.label, ...entry.aliases, entry.keys.join('')]))
  const builtIn = fixed.filter(entry => matches([entry.label, entry.keys.join('')]))
  const groups: ShortcutGroup[] = [
    { title: 'ACRYL', rows: listed.filter(entry => isAcryl(entry.id)).map(editable) },
    { title: 'App', rows: listed.filter(entry => !isAcryl(entry.id)).map(editable) },
    { title: 'Text editing and menus (fixed)', rows: builtIn.map(entry => ({ id: entry.id, label: entry.label, keys: entry.keys, editable: false, modified: false, problem: null })) },
  ]
  return groups.filter(group => group.rows.length > 0)
}

/** The keys of a key press, as the recorder sees them. */
export type KeyPress = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'isComposing'>

export type RecordedKey =
  | { readonly kind: 'cancel' }
  /** A modifier alone, a dead key or text being composed: keep listening. */
  | { readonly kind: 'wait' }
  | { readonly kind: 'binding'; readonly binding: ShortcutBinding }

/** @returns what one key press means while a shortcut is being recorded. */
export function recordKey(event: KeyPress): RecordedKey {
  const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(name => ({ control: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey })[name])
  if (event.key === 'Escape' && modifiers.length === 0) return { kind: 'cancel' }
  if (event.isComposing || event.key === 'Dead' || /^(Control|Alt|Shift|Meta)(Left|Right)?$/u.test(event.code)) return { kind: 'wait' }
  return { kind: 'binding', binding: { code: event.code, modifiers } }
}

const ISSUES: Record<string, string> = {
  reserved: 'That combination is reserved for the system or text editing.',
  'unsupported-browser': 'A browser page cannot use that combination; try another.',
  'modifier-required': 'Add Cmd, Ctrl, Alt or Shift.',
  'unsupported-key': 'That key is not supported.',
}

const SAVE_FAILURES: Record<string, string> = {
  stale: 'Shortcuts changed in another window. Try again.',
  unreadable: 'The shortcuts file could not be read, so nothing was saved.',
  'write-failed': 'Could not save. Your previous shortcuts are kept.',
  'not-ready': 'Shortcuts are still loading. Try again in a moment.',
  conflict: 'Another command already uses that combination.',
}

/**
 * Save `binding` for `id` the way DSH's own editor does: refused when the device cannot use it or another command has it, and saved against
 * the configuration revision the user was looking at.
 * @returns null when saved, else what to tell the user.
 */
export async function saveBinding(shortcuts: Pick<Shortcuts, 'describeBinding' | 'edit' | 'config' | 'catalog' | 'fixedCatalog'>, id: ShortcutCommandId, binding: ShortcutBinding): Promise<string | null> {
  let described: ReturnType<Shortcuts['describeBinding']>
  try {
    described = shortcuts.describeBinding(binding)
  } catch (_unsupported) {
    // `describeBinding` throws for a key code it does not know.
    return ISSUES['unsupported-key'] ?? null
  }
  if (described.issue !== null) return ISSUES[described.issue] ?? described.issue
  const others = described.conflicts.filter(other => other !== id)
  if (others.length > 0) {
    const names = [...shortcuts.catalog.getSnapshot(), ...shortcuts.fixedCatalog.getSnapshot()]
    return `Already used by ${others.map(other => names.find(entry => entry.id === other)?.label ?? other).join(', ')}.`
  }
  const result = await shortcuts.edit({ type: 'set', id, binding }, shortcuts.config.getSnapshot().revision)
  return result.status === 'saved' ? null : SAVE_FAILURES[result.status] ?? 'Could not save.'
}
