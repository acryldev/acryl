/** Labels for allowlisted Terminal / agent tabs. */

import type { WorkspacePtyCommandId } from '../../workspace-pty-contract.ts'
import { WORKSPACE_PTY_COMMAND_IDS } from '../../workspace-pty-contract.ts'

export interface WorkspaceAgentCommand {
  readonly id: WorkspacePtyCommandId
  readonly label: string
}

export interface WorkspaceSurfaceAction {
  readonly kind: 'pty' | 'file' | 'browser' | 'diff' | 'kanban' | 'doc'
  readonly commandId?: WorkspacePtyCommandId
  readonly label: string
}

const LABELS: Record<WorkspacePtyCommandId, string> = {
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

export const WORKSPACE_SURFACE_ACTIONS: readonly WorkspaceSurfaceAction[] = [
  { kind: 'pty', commandId: 'shell', label: 'New Terminal' },
  { kind: 'browser', label: 'New Browser Tab' },
  { kind: 'file', label: 'New File' },
  { kind: 'diff', label: 'New Diff' },
  { kind: 'kanban', label: 'New Board' },
  { kind: 'doc', label: 'New Doc' },
]

export const WORKSPACE_AGENT_COMMANDS: readonly WorkspaceAgentCommand[] = WORKSPACE_PTY_COMMAND_IDS
  .filter(id => id !== 'shell')
  .map(id => ({ id, label: LABELS[id] }))

export function labelForCommand(id: WorkspacePtyCommandId): string {
  return LABELS[id]
}
