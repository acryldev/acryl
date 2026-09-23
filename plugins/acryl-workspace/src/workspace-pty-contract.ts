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
