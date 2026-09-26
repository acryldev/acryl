/** Roles, accessible names and states of DOM elements, in the small subset a snapshot needs. */

import { isSensitive } from './sensitivity.ts'

const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', image: 'button',
  range: 'slider', number: 'spinbutton', search: 'searchbox', text: 'textbox', email: 'textbox', url: 'textbox', tel: 'textbox', password: 'textbox',
}

const LANDMARKS: Record<string, string> = { nav: 'navigation', main: 'main', aside: 'complementary', dialog: 'dialog', form: 'form' }

/** ARIA roles an element may declare that the driver treats as interactive or structural. */
const EXPLICIT_ROLES = new Set([
  'button', 'link', 'tab', 'tabpanel', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio', 'switch', 'textbox',
  'searchbox', 'combobox', 'listbox', 'option', 'slider', 'spinbutton', 'dialog', 'alertdialog', 'alert', 'status', 'navigation', 'main',
  'heading', 'tree', 'treeitem', 'row', 'gridcell', 'tablist', 'toolbar', 'region', 'form', 'img',
])

/** @returns the element's role, or null when it is not something a snapshot lists. */
export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim().toLowerCase().split(/\s+/)[0]
  if (explicit !== undefined && explicit !== '' && EXPLICIT_ROLES.has(explicit)) return explicit
  const tag = el.tagName.toLowerCase()
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null
  if (tag === 'button' || tag === 'summary') return 'button'
  if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox'
  if (tag === 'textarea') return 'textbox'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'img') return el.getAttribute('alt')?.trim() ? 'img' : null
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase()
    if (type === 'hidden') return null
    return INPUT_ROLES[type] ?? 'textbox'
  }
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return 'textbox'
  // A form is only a landmark when it has a name; an unnamed one is noise in a snapshot.
  if (tag === 'form') return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'form' : null
  return LANDMARKS[tag] ?? null
}

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()
const clip = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const textOf = (el: Element, max: number): string => clip(collapse(el.textContent ?? ''), max)

/** ARIA-style accessible name, kept short. */
export function nameOf(el: Element, role: string): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria !== undefined && aria !== '') return clip(collapse(aria), 120)
  const by = el.getAttribute('aria-labelledby')
  if (by !== null && by.trim() !== '') {
    const joined = collapse(by.split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' '))
    if (joined !== '') return clip(joined, 120)
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const id = el.id
    const explicit = id === '' ? null : el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)
    const wrapping = el.closest('label')
    const labelText = collapse((explicit ?? wrapping)?.textContent ?? '')
    if (labelText !== '') return clip(labelText, 120)
    if (el instanceof HTMLInputElement && (el.type === 'button' || el.type === 'submit' || el.type === 'reset') && el.value !== '') return clip(el.value, 120)
    const placeholder = el.getAttribute('placeholder')?.trim()
    if (placeholder !== undefined && placeholder !== '') return clip(placeholder, 120)
  }
  if (role === 'img') return clip(collapse(el.getAttribute('alt') ?? ''), 120)
  if (['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'heading', 'switch', 'treeitem', 'checkbox', 'radio'].includes(role)) {
    const text = textOf(el, 120)
    if (text !== '') return text
  }
  if (role === 'alert' || role === 'status' || role === 'dialog' || role === 'alertdialog') {
    const text = textOf(el, 160)
    if (text !== '') return text
  }
  return clip(collapse(el.getAttribute('title') ?? ''), 120)
}

/** The state words a snapshot shows for an element. */
export function statesOf(el: Element, role: string): string[] {
  const states: string[] = []
  const aria = (name: string): string | null => el.getAttribute(name)
  if ((el as HTMLButtonElement).disabled === true || aria('aria-disabled') === 'true') states.push('disabled')
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) { if (el.checked) states.push('checked') } else if (aria('aria-checked') === 'true') states.push('checked')
  if (aria('aria-expanded') === 'true') states.push('expanded')
  if (aria('aria-expanded') === 'false') states.push('collapsed')
  if (aria('aria-selected') === 'true') states.push('selected')
  if (aria('aria-pressed') === 'true') states.push('pressed')
  if (aria('aria-current') !== null && aria('aria-current') !== 'false') states.push('current')
  if (aria('aria-invalid') === 'true') states.push('invalid')
  if ((el as HTMLInputElement).required === true || aria('aria-required') === 'true') states.push('required')
  if ((el as HTMLInputElement).readOnly === true || aria('aria-readonly') === 'true') states.push('readonly')
  if (el.ownerDocument.activeElement === el) states.push('focused')
  void role
  return states
}

/** The visible value of an editable field, or undefined when it is empty, not editable, or sensitive. */
export function valueOf(el: Element, role: string): string | undefined {
  if (role !== 'textbox' && role !== 'searchbox' && role !== 'combobox' && role !== 'spinbutton') return undefined
  if (isSensitive(el)) return undefined
  let value: string | undefined
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) value = el.value
  else if (el instanceof HTMLSelectElement) value = el.selectedOptions[0]?.textContent ?? undefined
  else if (el.hasAttribute('contenteditable')) value = el.textContent ?? undefined
  return value === undefined || value === '' ? undefined : clip(value, 100)
}

/** Heading level, when the element is a heading. */
export function levelOf(el: Element): number | undefined {
  const explicit = Number(el.getAttribute('aria-level'))
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 6) return explicit
  const match = /^h([1-6])$/.exec(el.tagName.toLowerCase())
  return match === null ? undefined : Number(match[1])
}

/** Hidden from everyone: the driver skips it and everything inside it. */
export function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true
  if (el instanceof HTMLInputElement && el.type === 'hidden') return true
  const view = el.ownerDocument.defaultView
  if (view === null) return false
  const style = view.getComputedStyle(el)
  return style.display === 'none' || style.visibility === 'hidden'
}
