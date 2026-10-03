/** The actions the driver performs on the page, each guarded by the same rules. */

import { MAX_WAIT_MS, UiControlError, type UiActionResult, type UiRequest } from '../../contract.ts'
import { isHidden, nameOf, roleOf } from './accessibility.ts'
import type { RefTable } from './ref-table.ts'
import { isProtected, isSensitive } from './sensitivity.ts'
import { DRIVER_UI_ATTRIBUTE } from './snapshot.ts'

type Request<Op extends UiRequest['op']> = Extract<UiRequest, { op: Op }>

const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox'])
const POLL_MS = 50

export interface ActionEnvironment {
  readonly refs: RefTable
  readonly document: () => Document
  /** Resolves after `ms`; rejects when `signal` aborts. Injectable so tests need no real time. */
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
}

const target = (role: string, name: string): { role: string; name: string } => ({ role, name })

function effectivelyHidden(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) if (isHidden(node)) return true
  return false
}

/** Everything an action checks before touching an element. */
function prepare(env: ActionEnvironment, ref: string): { element: Element; role: string; name: string } {
  const resolved = env.refs.resolve(ref)
  const { element } = resolved
  if (isSensitive(element)) throw new UiControlError('sensitive', 'that is a password, token or payment field; the agent does not read or type into it')
  if (isProtected(element)) throw new UiControlError('protected', `"${resolved.name}" belongs to approval, permissions or Agent Control itself; only the user operates it`)
  if (effectivelyHidden(element)) throw new UiControlError('not-actionable', `"${resolved.name}" is not visible`)
  if ((element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true') {
    throw new UiControlError('not-actionable', `"${resolved.name}" is disabled`)
  }
  return resolved
}

function mouse(element: Element, type: string): void {
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
}

/** xterm.js reads neither the value of its input textarea nor a bare synthetic key: text arrives as a paste, and key handling reads the legacy `keyCode`. */
function isTerminalInput(element: Element): boolean {
  return element.classList.contains('xterm-helper-textarea')
}

function pasteInto(element: Element, text: string): void {
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/plain', text)
  element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
}

const LEGACY_KEY_CODES: Readonly<Record<string, number>> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter === undefined) element.value = value
  else setter.call(element, value)
}

export function click(env: ActionEnvironment, request: Request<'click'>): UiActionResult {
  const { element, role, name } = prepare(env, request.ref)
  ;(element as HTMLElement).scrollIntoView?.({ block: 'nearest' })
  ;(element as HTMLElement).focus?.()
  mouse(element, 'mousedown')
  mouse(element, 'mouseup')
  ;(element as HTMLElement).click()
  return { ok: true, target: target(role, name) }
}

export function typeText(env: ActionEnvironment, request: Request<'type'>): UiActionResult {
  const { element, role, name } = prepare(env, request.ref)
  if (!EDITABLE_ROLES.has(role) || (role === 'combobox' && element instanceof HTMLSelectElement)) {
    throw new UiControlError('not-actionable', `"${name}" is a ${role}, not a text field; use select or click`)
  }
  if ((element as HTMLInputElement).readOnly === true || element.getAttribute('aria-readonly') === 'true') {
    throw new UiControlError('not-actionable', `"${name}" is read-only`)
  }
  const clear = request.clear ?? true
  ;(element as HTMLElement).focus?.()
  if (isTerminalInput(element)) {
    // A terminal has no text to clear: what is typed goes to the process that is running in it.
    pasteInto(element, request.text)
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, clear ? request.text : element.value + request.text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else {
    element.textContent = clear ? request.text : (element.textContent ?? '') + request.text
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (request.submit === true) pressKey(env, { op: 'press', key: 'Enter', ref: request.ref })
  return { ok: true, target: target(role, name), detail: `typed ${String(request.text.length)} characters` }
}

export function selectOption(env: ActionEnvironment, request: Request<'select'>): UiActionResult {
  const { element, role, name } = prepare(env, request.ref)
  if (!(element instanceof HTMLSelectElement)) throw new UiControlError('not-actionable', `"${name}" is a ${role}, not a select; click it and pick the option`)
  const wanted = request.option.trim().toLowerCase()
  const options = Array.from(element.options)
  const match = options.find(option => option.value.toLowerCase() === wanted) ?? options.find(option => (option.textContent ?? '').trim().toLowerCase() === wanted)
  if (match === undefined) throw new UiControlError('not-found', `"${name}" has no option "${request.option}"`)
  if (match.disabled) throw new UiControlError('not-actionable', `the option "${request.option}" is disabled`)
  element.value = match.value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true, target: target(role, name), detail: `selected ${match.textContent?.trim() ?? match.value}` }
}

export function pressKey(env: ActionEnvironment, request: Request<'press'>): UiActionResult {
  const doc = env.document()
  let element: Element
  let role: string
  let name: string
  if (request.ref !== undefined) {
    ({ element, role, name } = prepare(env, request.ref))
  } else {
    element = doc.activeElement ?? doc.body
    if (isSensitive(element)) throw new UiControlError('sensitive', 'the focused field is a password, token or payment field')
    if (isProtected(element)) throw new UiControlError('protected', 'the focused control belongs to approval, permissions or Agent Control itself')
    role = roleOf(element) ?? 'page'
    name = roleOf(element) === null ? '' : nameOf(element, role)
  }
  const key = request.key === 'Space' ? ' ' : request.key
  const keyCode = LEGACY_KEY_CODES[key]
  const init = { key, bubbles: true, cancelable: true, ...(keyCode === undefined ? {} : { keyCode, which: keyCode }) }
  ;(element as HTMLElement).focus?.()
  const proceed = element.dispatchEvent(new KeyboardEvent('keydown', init))
  if (proceed) {
    // A synthetic key event does not do what a real one does, so the two defaults that matter are done here.
    if ((key === 'Enter' || key === ' ') && (role === 'button' || role === 'link')) (element as HTMLElement).click()
    else if (key === 'Enter' && element instanceof HTMLInputElement && element.form !== null) element.form.requestSubmit?.()
  }
  element.dispatchEvent(new KeyboardEvent('keyup', init))
  return { ok: true, target: target(role, name), detail: `pressed ${request.key}` }
}

export function scroll(env: ActionEnvironment, request: Request<'scroll'>): UiActionResult {
  const doc = env.document()
  const amount = request.amount ?? 400
  const dx = request.direction === 'left' ? -amount : request.direction === 'right' ? amount : 0
  const dy = request.direction === 'up' ? -amount : request.direction === 'down' ? amount : 0
  if (request.ref !== undefined) {
    const { element, role, name } = env.refs.resolve(request.ref)
    ;(element as HTMLElement).scrollBy?.({ left: dx, top: dy })
    if (typeof (element as HTMLElement).scrollBy !== 'function') { element.scrollTop += dy; element.scrollLeft += dx }
    return { ok: true, target: target(role, name), detail: `scrolled ${request.direction}` }
  }
  const view = doc.defaultView
  view?.scrollBy?.({ left: dx, top: dy })
  return { ok: true, detail: `scrolled the page ${request.direction}` }
}

/** True when something visible on the page matches `request`. */
function present(env: ActionEnvironment, request: Request<'wait'>): boolean {
  const doc = env.document()
  const walk = (element: Element): boolean => {
    if (element.hasAttribute(DRIVER_UI_ATTRIBUTE) || isHidden(element) || isSensitive(element)) return false
    const role = roleOf(element)
    if (request.role !== undefined || request.name !== undefined) {
      if (role !== null && (request.role === undefined || role === request.role.toLowerCase()) && (request.name === undefined || nameOf(element, role).toLowerCase().includes(request.name.toLowerCase()))) return true
    }
    if (request.text !== undefined && element.children.length === 0 && (element.textContent ?? '').toLowerCase().includes(request.text.toLowerCase())) return true
    return Array.from(element.children).some(walk)
  }
  return walk(doc.body)
}

export async function wait(env: ActionEnvironment, request: Request<'wait'>, signal: AbortSignal): Promise<UiActionResult> {
  const budget = Math.min(request.timeoutMs ?? 3000, MAX_WAIT_MS)
  let waited = 0
  const wantGone = request.gone === true
  for (;;) {
    if (present(env, request) !== wantGone) return { ok: true, detail: wantGone ? 'it is gone' : 'it is there' }
    if (waited >= budget) throw new UiControlError('not-found', wantGone ? 'it did not go away in time' : 'it did not appear in time')
    await env.sleep(POLL_MS, signal)
    waited += POLL_MS
  }
}
