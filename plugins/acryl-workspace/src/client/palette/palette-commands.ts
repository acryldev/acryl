/**
 * The palette's built-in items, built from one port (`PaletteActions`) so the rules here run with no page and no
 * canvas. The canvas implements the port; nothing here knows how a tab is opened.
 */

import type { SettingsSectionKey } from '../settings/locales.ts'
import { WORKSPACE_SURFACE_ACTIONS, type WorkspaceSurfaceAction } from '../terminal/agent-commands.ts'
import type { PaletteItem } from './palette-items.ts'

/** What the palette may ask the workspace to do. */
export interface PaletteActions {
  openSurface(kind: WorkspaceSurfaceAction['kind']): void
  openAgent(id: string, label: string): void
  /** @returns false when the Settings panel could not be opened. */
  openSettings(section: SettingsSectionKey): boolean
  toggleRightPanel(): void
  setShellMode(mode: 'chats' | 'projects'): void
  selectWorktree(path: string): void
  focusTab(tabId: string): void
  closeActiveTab(): void
  openFile(worktree: string, file: string, line?: number): void
}

export interface PaletteView {
  /** The tab types the + menu offers right now (a disabled type is not listed). */
  readonly surfaces: readonly WorkspaceSurfaceAction[]
  /** Agents that can be launched: installed and enabled. */
  readonly agents: readonly { readonly id: string; readonly label: string }[]
  readonly worktrees: readonly { readonly path: string; readonly label: string }[]
  readonly tabs: readonly { readonly id: string; readonly title: string; readonly kind: string }[]
}

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
/** The palette's own shortcut, drawn for the platform. */
export const PALETTE_SHORTCUT_LABEL = (): string => (isMac() ? '⌘⇧K' : 'Ctrl+Shift+K')

interface FixedCommand {
  readonly id: string
  readonly title: string
  readonly keywords: readonly string[]
  run(actions: PaletteActions): void
}

/** The commands that always exist, whatever is open. */
const FIXED_COMMANDS: readonly FixedCommand[] = [
  { id: 'command:close-tab', title: 'Close current tab', keywords: ['close', 'tab'], run: a => { a.closeActiveTab() } },
  { id: 'command:right-panel', title: 'Toggle right panel', keywords: ['changes', 'review', 'checks', 'files', 'sidebar'], run: a => { a.toggleRightPanel() } },
  { id: 'command:mode-chats', title: 'Show chats in the left pane', keywords: ['sidebar', 'sessions'], run: a => { a.setShellMode('chats') } },
  { id: 'command:mode-projects', title: 'Show projects in the left pane', keywords: ['sidebar', 'worktrees', 'repositories'], run: a => { a.setShellMode('projects') } },
]

const SETTINGS_ENTRIES: ReadonlyArray<{ readonly key: SettingsSectionKey; readonly title: string; readonly keywords: readonly string[] }> = [
  { key: 'agents', title: 'Settings: Agents', keywords: ['default agent', 'yolo', 'manual', 'permissions', 'install', 'command'] },
  { key: 'tabs', title: 'Settings: Tabs', keywords: ['tab types', 'enable', 'disable', 'custom tab'] },
  { key: 'palette', title: 'Settings: Command palette', keywords: ['what is listed', 'shortcuts', 'search'] },
]

const surfaceId = (kind: WorkspaceSurfaceAction['kind']): string => `command:surface:${kind}`

/** Every entry Settings > Command palette can turn off one by one: what exists without a search or a project. */
export const CONFIGURABLE_ENTRIES: readonly { readonly id: string; readonly title: string }[] = [
  ...WORKSPACE_SURFACE_ACTIONS.map(surface => ({ id: surfaceId(surface.kind), title: surface.label })),
  ...FIXED_COMMANDS.map(({ id, title }) => ({ id, title })),
  ...SETTINGS_ENTRIES.map(entry => ({ id: `setting:${entry.key}`, title: entry.title })),
]

/**
 * @param actions - what the workspace can do.
 * @param view - what exists right now.
 * @param notify - called with a message when an action cannot run (for example Settings not found).
 * @returns the commands, agents, open tabs, worktrees and settings entries.
 */
export function buildPaletteItems(actions: PaletteActions, view: PaletteView, notify: (message: string) => void): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const surface of view.surfaces) {
    items.push({ id: surfaceId(surface.kind), group: 'command', title: surface.label, keywords: ['open', 'create', 'tab', surface.kind], run: () => { actions.openSurface(surface.kind) } })
  }
  for (const command of FIXED_COMMANDS) {
    items.push({ id: command.id, group: 'command', title: command.title, keywords: command.keywords, run: () => { command.run(actions) } })
  }
  for (const agent of view.agents) {
    items.push({ id: `agent:${agent.id}`, group: 'agent', title: `Open ${agent.label}`, subtitle: 'Coding agent in a terminal tab', keywords: [agent.id, 'agent', 'new', 'start'], run: () => { actions.openAgent(agent.id, agent.label) } })
  }
  for (const tab of view.tabs) {
    items.push({ id: `tab:${tab.id}`, group: 'tab', title: tab.title, subtitle: tab.kind, keywords: ['go', 'switch', 'tab'], run: () => { actions.focusTab(tab.id) } })
  }
  for (const worktree of view.worktrees) {
    items.push({ id: `worktree:${worktree.path}`, group: 'worktree', title: worktree.label, subtitle: worktree.path, keywords: ['switch', 'branch', 'worktree'], run: () => { actions.selectWorktree(worktree.path) } })
  }
  for (const entry of SETTINGS_ENTRIES) {
    items.push({ id: `setting:${entry.key}`, group: 'setting', title: entry.title, keywords: entry.keywords, run: () => { if (!actions.openSettings(entry.key)) notify('Open Settings from the left pane.') } })
  }
  return items
}
