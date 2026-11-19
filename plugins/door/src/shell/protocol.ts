/**
 * What the door and the desktop shell say to each other. The shell is the Electron main process of `npm run desktop`; it reaches the door as a page does (an event
 * stream down, a POST up) and answers calls about the app's windows and menu. This file is plain data and checks, so the shell side can follow it without importing the door.
 */

/** The shell's operations, one per door verb (`window-list` is `acryl window list`). */
export const SHELL_OPS = ['window-list', 'window-open', 'window-focus', 'window-close', 'window-resize', 'menu-list', 'menu-click'] as const
export type ShellOp = (typeof SHELL_OPS)[number]

export type ShellRequest =
  | { readonly op: 'window-list' }
  | { readonly op: 'window-open'; readonly path?: string }
  | { readonly op: 'window-focus'; readonly id: number }
  /** `force`: the window may be the last, and closing the last one ends the desktop app (and with it the server it started). */
  | { readonly op: 'window-close'; readonly id: number; readonly force?: boolean }
  | { readonly op: 'window-resize'; readonly id: number; readonly width: number; readonly height: number }
  | { readonly op: 'menu-list' }
  /** `force`: the item may end the desktop app (Quit, or Close Window on the last window). */
  | { readonly op: 'menu-click'; readonly path: string; readonly force?: boolean }

export interface ShellWindow {
  /** Electron's own window id: the number `window list` prints and `--window` takes. */
  readonly id: number
  readonly title: string
  /** The path (with query) the window shows, never the origin. */
  readonly path: string
  readonly focused: boolean
  readonly width: number
  readonly height: number
  /** Where the window's top left corner is on the screen (so two windows on top of each other can be told). */
  readonly x?: number
  readonly y?: number
}

export interface ShellMenuItem {
  /** Labels from the top of the menu, joined with `>`: `File>New Note`. */
  readonly path: string
  readonly label: string
  readonly enabled: boolean
  /** True for an item that ends the desktop app (Quit, or Close Window): `menu click` presses it only with `force`. */
  readonly ends?: boolean
}

export type ShellResult =
  | { readonly windows: readonly ShellWindow[] }
  | { readonly items: readonly ShellMenuItem[] }
  | { readonly ok: true; readonly detail: string; readonly id?: number }

/** Door to shell. */
export interface ShellCall {
  readonly t: 'call'
  readonly id: number
  readonly request: ShellRequest
}

/** Shell to door. */
export type ShellAnswer =
  | { readonly t: 'result'; readonly id: number; readonly value: ShellResult }
  | { readonly t: 'error'; readonly id: number; readonly code: string; readonly message: string }

export type ShellErrorCode = 'invalid' | 'no-desktop' | 'no-such-window' | 'last-window' | 'no-such-menu-item' | 'disabled' | 'quits-app' | 'timeout' | 'disconnected' | 'unloaded' | 'aborted' | 'failed'

export class ShellError extends Error {
  readonly code: ShellErrorCode

  constructor(code: ShellErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ShellError'
  }
}

/** A path of the app, as `act navigate` takes one: one leading `/`, and no other site. */
const APP_PATH = /^\/(?![/\\])[^\s\\]*$/u

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function only(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).filter(key => key !== 'op' && !allowed.includes(key))
  if (extra.length > 0) throw new ShellError('invalid', `unknown field ${extra.join(', ')}`)
}

function windowId(value: Record<string, unknown>): number {
  if (typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 1) throw new ShellError('invalid', 'id must be the number `window list` prints for the window')
  return value.id
}

function size(value: Record<string, unknown>, key: 'width' | 'height'): number {
  const number = value[key]
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 200 || number > 10_000) throw new ShellError('invalid', `${key} must be a whole number of pixels from 200 to 10000`)
  return number
}

/** @throws ShellError `invalid`. */
export function parseShellRequest(op: ShellOp, input: unknown): ShellRequest {
  const value = isRecord(input) ? input : {}
  switch (op) {
    case 'window-list': only(value, []); return { op }
    case 'window-open': {
      only(value, ['path'])
      if (value.path === undefined) return { op }
      if (typeof value.path !== 'string' || !APP_PATH.test(value.path)) throw new ShellError('invalid', 'path must be a path of this app, such as /settings (it starts with one /, and names no other site)')
      return { op, path: value.path }
    }
    case 'window-focus': only(value, ['id']); return { op, id: windowId(value) }
    case 'window-close': {
      only(value, ['id', 'force'])
      if (value.force !== undefined && typeof value.force !== 'boolean') throw new ShellError('invalid', 'force must be true or false')
      return { op, id: windowId(value), ...(value.force === true ? { force: true } : {}) }
    }
    case 'window-resize': only(value, ['id', 'width', 'height']); return { op, id: windowId(value), width: size(value, 'width'), height: size(value, 'height') }
    case 'menu-list': only(value, []); return { op }
    case 'menu-click': {
      only(value, ['path', 'force'])
      if (typeof value.path !== 'string' || value.path.trim() === '' || value.path.length > 300) throw new ShellError('invalid', 'path is the labels from the top of the menu joined with >, e.g. "File>New Note" (`menu list` prints them)')
      if (value.force !== undefined && typeof value.force !== 'boolean') throw new ShellError('invalid', 'force must be true or false')
      return { op, path: value.path, ...(value.force === true ? { force: true } : {}) }
    }
  }
}

/** @param value - one parsed POST body from the shell; null when it is not a well-formed answer. */
export function parseShellAnswer(value: unknown): ShellAnswer | null {
  if (!isRecord(value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id)) return null
  if (value.t === 'result' && isRecord(value.value)) return { t: 'result', id: value.id, value: value.value as unknown as ShellResult }
  if (value.t === 'error' && typeof value.code === 'string' && typeof value.message === 'string') return { t: 'error', id: value.id, code: value.code.slice(0, 40), message: value.message.slice(0, 500) }
  return null
}

/** Whatever code the shell used, as one the door knows (an unknown code is `failed`). */
export function shellErrorCode(code: string): ShellErrorCode {
  return (['invalid', 'no-such-window', 'last-window', 'no-such-menu-item', 'disabled', 'quits-app'] as const).find(known => known === code) ?? 'failed'
}
