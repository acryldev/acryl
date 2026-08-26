/** Allowlisted Development Canvas PTY commands and loopback routes. */

export const CANVAS_PTY_COMMAND_IDS = [
  'shell',
  'claude',
  'codex',
  'opencode',
  'gemini',
  'pi',
  'grok',
  'aider',
  'goose',
  'amp',
  'kimi',
  'cursor',
  'hermes',
  'qwen',
] as const

export type CanvasPtyCommandId = (typeof CANVAS_PTY_COMMAND_IDS)[number]

export const CANVAS_PTY_PATH = '/api/development-canvas/pty'
export const CANVAS_PTY_INPUT_PATH = '/api/development-canvas/pty/input'
export const CANVAS_PTY_RESIZE_PATH = '/api/development-canvas/pty/resize'
export const CANVAS_PTY_CLOSE_PATH = '/api/development-canvas/pty/close'

const COMMAND_IDS = new Set<string>(CANVAS_PTY_COMMAND_IDS)

/** @param value - unknown command id from JSON. */
export function isCanvasPtyCommandId(value: unknown): value is CanvasPtyCommandId {
  return typeof value === 'string' && COMMAND_IDS.has(value)
}

export type CanvasPtyStatus = 'starting' | 'running' | 'exited' | 'error'

export interface CanvasPtyView {
  readonly id: string
  readonly status: CanvasPtyStatus
  readonly output: string
  readonly exitCode: number | null
  readonly error: string | null
}
