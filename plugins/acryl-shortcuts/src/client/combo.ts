/**
 * Canonical combo string format: modifiers in a fixed order, joined by `+`, lowercase key last -
 * e.g. `"cmd+shift+."`. One shared format so a captured combo (from the Shortcuts settings page)
 * and a live keydown (checked by the plugin that owns the action) always compare equal.
 */

/** Modifier-only keys never form a combo by themselves - capture waits for a real key. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

/**
 * Fixed modifier order: cmd, ctrl, alt, shift, then the key - matching every `defaultCombo` string
 * registered in this codebase (e.g. `'cmd+shift+.'`). A mismatched order here would silently break
 * every default combo's own match (found exactly this way: a real Cmd+Shift+. dispatch against the
 * mount-anchors default failed until this order was fixed to lead with cmd, not ctrl).
 */
export function formatCombo(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const parts: string[] = []
  if (event.metaKey) parts.push('cmd')
  if (event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase())
  return parts.join('+')
}

/** Whether a real keydown event is the one a stored combo string describes. */
export function matchesCombo(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, combo: string): boolean {
  if (combo === '') return false
  return formatCombo(event) === combo
}

/** A short, readable label for display (e.g. `"⌘⇧."` on the combo's own terms, kept simple as text here). */
export function describeCombo(combo: string): string {
  if (combo === '') return '(unassigned)'
  return combo
    .split('+')
    .map(part => ({ cmd: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }[part] ?? part.toUpperCase())).join(' ')
}
