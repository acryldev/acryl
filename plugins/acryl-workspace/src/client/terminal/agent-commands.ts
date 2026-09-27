/** Labels for allowlisted Terminal / agent tabs. */

import type { WorkspacePtyCommandId } from '../../pty/contract.ts'
import { KNOWN_AGENTS, knownAgent } from '../../agents/known-agents.ts'

export interface WorkspaceAgentCommand {
  readonly id: WorkspacePtyCommandId
  readonly label: string
}

export interface WorkspaceSurfaceAction {
  readonly kind: 'pty' | 'file' | 'browser' | 'diff' | 'kanban' | 'doc'
  readonly commandId?: WorkspacePtyCommandId
  readonly label: string
}

export const WORKSPACE_SURFACE_ACTIONS: readonly WorkspaceSurfaceAction[] = [
  { kind: 'pty', commandId: 'shell', label: 'New Terminal' },
  { kind: 'browser', label: 'New Browser Tab' },
  { kind: 'file', label: 'New File' },
  { kind: 'diff', label: 'New Diff' },
  { kind: 'kanban', label: 'New Board' },
  { kind: 'doc', label: 'New Doc' },
]

export const WORKSPACE_AGENT_COMMANDS: readonly WorkspaceAgentCommand[] = KNOWN_AGENTS.map(entry => ({ id: entry.id, label: entry.label }))

/** The name of an agent id; a custom agent's own name is used by the caller that knows it. */
export function labelForCommand(id: string): string {
  return id === 'shell' ? 'Terminal' : knownAgent(id)?.label ?? id
}
