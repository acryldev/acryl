/** Allowlisted ACRYL Workspace PTY commands and loopback routes. */

export const WORKSPACE_PTY_COMMAND_IDS = [
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

export type WorkspacePtyCommandId = (typeof WORKSPACE_PTY_COMMAND_IDS)[number]

export const WORKSPACE_PTY_PATH = '/api/acryl-workspace/pty'
export const WORKSPACE_PTY_INPUT_PATH = '/api/acryl-workspace/pty/input'
export const WORKSPACE_PTY_RESIZE_PATH = '/api/acryl-workspace/pty/resize'
export const WORKSPACE_PTY_CLOSE_PATH = '/api/acryl-workspace/pty/close'
/** WebSocket: live output down, keystrokes and size up, in order. Query: `id`, `since` (cursor already shown). */
export const WORKSPACE_PTY_STREAM_PATH = '/api/acryl-workspace/pty/stream'

const COMMAND_IDS = new Set<string>(WORKSPACE_PTY_COMMAND_IDS)

/** @param value - unknown command id from JSON. */
export function isWorkspacePtyCommandId(value: unknown): value is WorkspacePtyCommandId {
  return typeof value === 'string' && COMMAND_IDS.has(value)
}

export type WorkspacePtyStatus = 'starting' | 'running' | 'exited' | 'error'

export interface WorkspacePtyView {
  readonly id: string
  readonly status: WorkspacePtyStatus
  readonly output: string
  readonly exitCode: number | null
  readonly error: string | null
}

/** What the Host sends over the stream. */
export type PtyServerMessage =
  /** Output. `replace` clears the client's terminal first (it missed more than the Host kept). */
  | { readonly t: 'out'; readonly data: string; readonly cursor: number; readonly replace: boolean }
  | { readonly t: 'exit'; readonly exitCode: number | null; readonly error: string | null }

/** What the client sends over the stream. */
export type PtyClientMessage =
  | { readonly t: 'in'; readonly data: string }
  | { readonly t: 'resize'; readonly cols: number; readonly rows: number }

export const MAX_PTY_INPUT_CHARS = 256 * 1024
export const MAX_PTY_COLS = 500
export const MAX_PTY_ROWS = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param text - one text frame from the client; null when it is not a well-formed message. */
export function parsePtyClientMessage(text: string): PtyClientMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.t === 'in' && typeof value.data === 'string' && value.data.length <= MAX_PTY_INPUT_CHARS && Object.keys(value).length === 2) {
    return { t: 'in', data: value.data }
  }
  if (value.t === 'resize' && Object.keys(value).length === 3
    && typeof value.cols === 'number' && typeof value.rows === 'number'
    && Number.isInteger(value.cols) && Number.isInteger(value.rows)
    && value.cols >= 2 && value.cols <= MAX_PTY_COLS && value.rows >= 1 && value.rows <= MAX_PTY_ROWS) {
    return { t: 'resize', cols: value.cols, rows: value.rows }
  }
  return null
}

/** @param text - one text frame from the Host; throws on anything unexpected. */
export function parsePtyServerMessage(text: string): PtyServerMessage {
  const value: unknown = JSON.parse(text)
  if (isRecord(value)) {
    if (value.t === 'out' && typeof value.data === 'string' && typeof value.cursor === 'number' && typeof value.replace === 'boolean') {
      return { t: 'out', data: value.data, cursor: value.cursor, replace: value.replace }
    }
    if (value.t === 'exit' && (value.exitCode === null || typeof value.exitCode === 'number') && (value.error === null || typeof value.error === 'string')) {
      return { t: 'exit', exitCode: value.exitCode, error: value.error }
    }
  }
  throw new Error('acryl-workspace: invalid terminal stream message')
}

/** Any agent id the Host may be asked to start: a built-in one or one from the user's catalog. */
export type AgentId = string
