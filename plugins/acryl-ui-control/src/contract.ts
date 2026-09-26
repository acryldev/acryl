/**
 * The one shape of an Agent Control call, shared by the Host tools and the in-page driver.
 *
 * A Host tool turns a model's arguments into a {@link UiRequest}, sends it to the page over the channel, and
 * gets a {@link UiResponse} back. Everything crossing the channel is validated here once, so neither side
 * trusts the other's JSON.
 */

/** The operations the driver performs on the page. */
export const UI_OPS = ['snapshot', 'click', 'type', 'select', 'press', 'scroll', 'wait'] as const
export type UiOp = (typeof UI_OPS)[number]

/** Operations that change the page, so each call needs approval. `snapshot`, `scroll` and `wait` only look. */
export const MUTATING_OPS: readonly UiOp[] = ['click', 'type', 'select', 'press']

export const MAX_TEXT_LENGTH = 10_000
export const MAX_WAIT_MS = 10_000
export const MAX_SNAPSHOT_NODES = 1000
export const DEFAULT_SNAPSHOT_NODES = 300

/** Why a call did not do what was asked. Every failure is one of these, never a silent wrong action. */
export type UiErrorCode =
  | 'no-window'        // no ACRYL page is connected
  | 'stale-ref'        // the element changed or was replaced since the snapshot
  | 'unknown-ref'      // the ref was never issued
  | 'sensitive'        // a password, token, API key or payment field
  | 'protected'        // a control the agent may never operate (policy, approval, this plugin)
  | 'not-actionable'   // hidden, disabled, or the wrong kind of element for the action
  | 'not-found'        // a wait ended without the thing appearing
  | 'killed'           // the user pressed the kill switch
  | 'timeout'          // the page did not answer in time
  | 'aborted'          // the call was cancelled
  | 'unloaded'         // the driver went away mid-call
  | 'invalid'          // malformed request

export class UiControlError extends Error {
  constructor(readonly code: UiErrorCode, message: string) {
    super(message)
    this.name = 'UiControlError'
  }
}

/** One element in a snapshot. */
export interface UiNode {
  /** `<generation>.<n>`; valid only until the next snapshot. */
  readonly ref: string
  readonly role: string
  readonly name: string
  readonly depth: number
  /** Short state words: `disabled`, `checked`, `expanded`, `selected`, `focused`, `protected`, ... */
  readonly states: readonly string[]
  /** The text of an editable field, when it is not sensitive. */
  readonly value?: string
  /** Heading level, when it is a heading. */
  readonly level?: number
}

export interface UiSnapshot {
  readonly generation: number
  readonly title: string
  readonly nodes: readonly UiNode[]
  /** How many elements matched in all; more than `nodes.length` when the page was cut. */
  readonly total: number
  /** Pass to the next snapshot call to continue, or absent when this is everything. */
  readonly nextCursor?: number
}

export type UiRequest =
  | { readonly op: 'snapshot'; readonly cursor?: number; readonly maxNodes?: number }
  | { readonly op: 'click'; readonly ref: string }
  | { readonly op: 'type'; readonly ref: string; readonly text: string; readonly submit?: boolean; readonly clear?: boolean }
  | { readonly op: 'select'; readonly ref: string; readonly option: string }
  | { readonly op: 'press'; readonly key: string; readonly ref?: string }
  | { readonly op: 'scroll'; readonly direction: 'up' | 'down' | 'left' | 'right'; readonly ref?: string; readonly amount?: number }
  | { readonly op: 'wait'; readonly text?: string; readonly role?: string; readonly name?: string; readonly gone?: boolean; readonly timeoutMs?: number }

/** What the page did, and to which control (for the audit log and the approval prompt). */
export interface UiActionResult {
  readonly ok: true
  readonly target?: { readonly role: string; readonly name: string }
  readonly detail?: string
}

export type UiResult = UiSnapshot | UiActionResult

/** Messages the page and the Host exchange over the channel. */
export type ChannelToPage =
  | { readonly t: 'call'; readonly id: number; readonly request: UiRequest }
export type ChannelToHost =
  | { readonly t: 'hello'; readonly windowId: string; readonly focused: boolean }
  | { readonly t: 'focus'; readonly focused: boolean }
  | { readonly t: 'result'; readonly id: number; readonly value: UiResult }
  | { readonly t: 'error'; readonly id: number; readonly code: UiErrorCode; readonly message: string }

const KEYS = /^(?:[A-Za-z0-9]|Enter|Escape|Tab|Backspace|Delete|Space|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/
const REF = /^\d{1,9}\.\d{1,6}$/

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = (message: string): never => { throw new UiControlError('invalid', message) }

function ref(value: unknown): string {
  if (typeof value !== 'string' || !REF.test(value)) return invalid('ref must look like 3.17, from the latest snapshot')
  return value
}

function text(value: unknown, max = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) return invalid(`text must be a string of at most ${String(max)} characters`)
  return value
}

/** @param value - untrusted JSON. @throws UiControlError `invalid`. */
export function parseUiRequest(value: unknown): UiRequest {
  if (!isRecord(value) || typeof value.op !== 'string') return invalid('a call needs an op')
  const op = value.op as UiOp
  const only = (allowed: readonly string[]): void => {
    const extra = Object.keys(value).find(key => key !== 'op' && !allowed.includes(key))
    if (extra !== undefined) invalid(`unknown field ${extra}`)
  }
  switch (op) {
    case 'snapshot': {
      only(['cursor', 'maxNodes'])
      const cursor = value.cursor === undefined ? undefined : Number(value.cursor)
      const maxNodes = value.maxNodes === undefined ? undefined : Number(value.maxNodes)
      if ((cursor !== undefined && (!Number.isInteger(cursor) || cursor < 0)) || (maxNodes !== undefined && (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_SNAPSHOT_NODES))) return invalid('cursor and maxNodes must be small positive integers')
      return { op, ...(cursor === undefined ? {} : { cursor }), ...(maxNodes === undefined ? {} : { maxNodes }) }
    }
    case 'click': only(['ref']); return { op, ref: ref(value.ref) }
    case 'type': {
      only(['ref', 'text', 'submit', 'clear'])
      if ((value.submit !== undefined && typeof value.submit !== 'boolean') || (value.clear !== undefined && typeof value.clear !== 'boolean')) return invalid('submit and clear must be true or false')
      return { op, ref: ref(value.ref), text: text(value.text), ...(value.submit === undefined ? {} : { submit: value.submit }), ...(value.clear === undefined ? {} : { clear: value.clear }) }
    }
    case 'select': only(['ref', 'option']); return { op, ref: ref(value.ref), option: text(value.option, 500) }
    case 'press': {
      only(['key', 'ref'])
      if (typeof value.key !== 'string' || !KEYS.test(value.key)) return invalid('key must be a single character or a name such as Enter, Escape, Tab or ArrowDown')
      return { op, key: value.key, ...(value.ref === undefined ? {} : { ref: ref(value.ref) }) }
    }
    case 'scroll': {
      only(['direction', 'ref', 'amount'])
      if (value.direction !== 'up' && value.direction !== 'down' && value.direction !== 'left' && value.direction !== 'right') return invalid('direction must be up, down, left or right')
      const amount = value.amount === undefined ? undefined : Number(value.amount)
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 10_000)) return invalid('amount must be between 1 and 10000 pixels')
      return { op, direction: value.direction, ...(value.ref === undefined ? {} : { ref: ref(value.ref) }), ...(amount === undefined ? {} : { amount }) }
    }
    case 'wait': {
      only(['text', 'role', 'name', 'gone', 'timeoutMs'])
      const timeoutMs = value.timeoutMs === undefined ? undefined : Number(value.timeoutMs)
      if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_WAIT_MS)) return invalid(`timeoutMs must be between 0 and ${String(MAX_WAIT_MS)}`)
      if (value.gone !== undefined && typeof value.gone !== 'boolean') return invalid('gone must be true or false')
      if (value.text === undefined && value.role === undefined && value.name === undefined) return invalid('wait needs text, or a role and name')
      return {
        op,
        ...(value.text === undefined ? {} : { text: text(value.text, 500) }),
        ...(value.role === undefined ? {} : { role: text(value.role, 60) }),
        ...(value.name === undefined ? {} : { name: text(value.name, 500) }),
        ...(value.gone === undefined ? {} : { gone: value.gone }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }
    }
    default: return invalid(`unknown op ${String(op)}`)
  }
}

/** @param text - one text frame from the Host. @throws when it is not a well-formed call. */
export function parseChannelToPage(text: string): ChannelToPage {
  const value: unknown = JSON.parse(text)
  if (isRecord(value) && value.t === 'call' && typeof value.id === 'number' && Number.isSafeInteger(value.id)) {
    return { t: 'call', id: value.id, request: parseUiRequest(value.request) }
  }
  throw new UiControlError('invalid', 'not a channel call')
}

const ERROR_CODES: readonly UiErrorCode[] = ['no-window', 'stale-ref', 'unknown-ref', 'sensitive', 'protected', 'not-actionable', 'not-found', 'killed', 'timeout', 'aborted', 'unloaded', 'invalid']

/** @param text - one text frame from the page; null when it is not a well-formed message. */
export function parseChannelToHost(text: string): ChannelToHost | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.t === 'hello' && typeof value.windowId === 'string' && value.windowId.length <= 80 && typeof value.focused === 'boolean') return { t: 'hello', windowId: value.windowId, focused: value.focused }
  if (value.t === 'focus' && typeof value.focused === 'boolean') return { t: 'focus', focused: value.focused }
  if (value.t === 'result' && typeof value.id === 'number' && isRecord(value.value)) return { t: 'result', id: value.id, value: value.value as unknown as UiResult }
  if (value.t === 'error' && typeof value.id === 'number' && typeof value.message === 'string' && ERROR_CODES.includes(value.code as UiErrorCode)) {
    return { t: 'error', id: value.id, code: value.code as UiErrorCode, message: value.message.slice(0, 500) }
  }
  return null
}
