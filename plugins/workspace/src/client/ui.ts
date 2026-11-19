/**
 * The workspace's reusable client layers, for another root owner (the Blends frame) that shows terminals, files and git without the workbench:
 * the live terminal sessions, the PTY, files and git route clients, the agents a PTY can run, and xterm's stylesheet as text. Nothing here
 * registers a slot or a service; the importer owns placement and lifecycle. Settings > Agents comes as the plugins that register it.
 */

import xtermCss from 'virtual:xterm-css'

export { TerminalRegistry, TerminalSession, type TerminalAppearance, type TerminalSessionSnapshot, type TerminalStatus } from './terminal/terminal-session.ts'
export { createWorkspacePtyApi, type WorkspacePtyApi, type TerminalSize } from './terminal/pty-api.ts'
export { createWorkspaceFilesApi, type WorkspaceFilesApi } from './files/files-api.ts'
export { createWorkspaceGitApi, type WorkspaceGitApi } from './git/git-api.ts'
export { KNOWN_AGENTS, knownAgent, type KnownAgentId } from '../agents/known-agents.ts'
export type { FileEntry, FilesTreeView, FileContentView } from '../files/contract.ts'
export type { GitChange, GitStatusView } from '../git/contract.ts'
export { AgentsState } from './agents/agents-state.ts'
export { createWorkspaceAgentsApi } from './agents/agents-api.ts'
export { agentsSettingsPlugin } from './agents/agents-settings-plugin.ts'
export { settingsSharedPlugin } from './settings/section-plugin.ts'

/** xterm's own stylesheet; the importer injects it once, beside the `.xterm` rules a terminal needs. */
export const XTERM_CSS: string = xtermCss
