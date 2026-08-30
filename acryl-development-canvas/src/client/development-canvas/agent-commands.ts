/** Labels for allowlisted Terminal / agent tabs. */

import type { CanvasPtyCommandId } from '../../canvas-pty-contract.ts'
import { CANVAS_PTY_COMMAND_IDS } from '../../canvas-pty-contract.ts'

export interface CanvasAgentCommand {
  readonly id: CanvasPtyCommandId
  readonly label: string
}

export interface CanvasSurfaceAction {
  readonly kind: 'pty' | 'file' | 'browser'
  readonly commandId?: CanvasPtyCommandId
  readonly label: string
}

const LABELS: Record<CanvasPtyCommandId, string> = {
  shell: 'Terminal',
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini: 'Gemini',
  pi: 'Pi',
  grok: 'Grok',
  aider: 'Aider',
  goose: 'Goose',
  amp: 'Amp',
  kimi: 'Kimi',
  cursor: 'Cursor',
  hermes: 'Hermes',
  qwen: 'Qwen Code',
}

export const CANVAS_SURFACE_ACTIONS: readonly CanvasSurfaceAction[] = [
  { kind: 'pty', commandId: 'shell', label: 'New Terminal' },
  { kind: 'browser', label: 'New Browser Tab' },
  { kind: 'file', label: 'New File' },
]

export const CANVAS_AGENT_COMMANDS: readonly CanvasAgentCommand[] = CANVAS_PTY_COMMAND_IDS
  .filter(id => id !== 'shell')
  .map(id => ({ id, label: LABELS[id] }))

export function labelForCommand(id: CanvasPtyCommandId): string {
  return LABELS[id]
}
