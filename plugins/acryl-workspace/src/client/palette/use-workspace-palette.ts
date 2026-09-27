/**
 * Connects the palette to the canvas: builds the actions the palette may ask for, lists what exists right now,
 * and owns the palette's state and its global shortcut for as long as the canvas is mounted. It is the only
 * place that knows both sides; the palette's own rules never see the canvas.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { CustomAgent } from '../../agents/definition.ts'
import type { AgentSettingsView } from '../../agents/contract.ts'
import { menuAgents } from '../agents/agents-section-model.ts'
import { GLOBAL_GROUP, type WorkspaceGroups } from '../canvas/groups.ts'
import type { WorkspaceSnapshot, WorkspaceState } from '../canvas/state.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { ToastState } from '../notifications/toast-state.ts'
import { openSettingsSection } from '../settings/open-settings.ts'
import type { TabTypesState } from '../tabs/tab-types-state.ts'
import { WORKSPACE_SURFACE_ACTIONS } from '../terminal/agent-commands.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { createFileSearch } from './file-search.ts'
import type { PaletteConfigState } from './palette-config.ts'
import { buildPaletteItems, type PaletteActions, type PaletteView } from './palette-commands.ts'
import { startPaletteShortcut } from './palette-shortcut.ts'
import { PaletteState } from './palette-state.ts'

export interface WorkspacePaletteDeps {
  readonly workspace: WorkspaceState
  readonly groups: WorkspaceGroups
  readonly groupKey: string
  readonly snapshot: WorkspaceSnapshot
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
  readonly toasts: ToastState
  readonly agentSettings: AgentSettingsView | null
  readonly customAgents: readonly CustomAgent[]
  readonly tabTypes: TabTypesState
  readonly config: PaletteConfigState
  readonly rightPanel: { toggle(): void } | undefined
  openPty(commandId: string, title: string): void
  closeTile(tileId: string): void
}

export function useWorkspacePalette(deps: WorkspacePaletteDeps): PaletteState {
  const latest = useRef(deps)
  latest.current = deps

  const palette = useMemo(() => {
    const actions: PaletteActions = {
      openSurface: (kind) => {
        if (kind === 'pty') latest.current.openPty('shell', 'Terminal')
        else latest.current.workspace.addTile(kind)
      },
      openAgent: (id, label) => { latest.current.openPty(id, label) },
      openSettings: section => openSettingsSection(section),
      toggleRightPanel: () => { latest.current.rightPanel?.toggle() },
      setShellMode: (mode) => { latest.current.shell.setMode(mode) },
      selectWorktree: (path) => { latest.current.shell.select(path) },
      focusTab: (tabId) => { latest.current.workspace.selectTile(tabId) },
      closeActiveTab: () => {
        const { snapshot } = latest.current
        if (snapshot.activeId !== undefined) latest.current.closeTile(snapshot.activeId)
      },
      openFile: (worktree, file) => { latest.current.shell.openFile({ worktree, file }) },
    }
    const notify = (message: string): void => {
      const { toasts, groupKey, snapshot } = latest.current
      toasts.push(message, { group: groupKey, tabId: snapshot.activeId ?? '' })
    }
    const view = (): PaletteView => {
      const now = latest.current
      const snapshot = now.shell.getSnapshot()
      return {
        surfaces: now.tabTypes.enabled(WORKSPACE_SURFACE_ACTIONS),
        agents: menuAgents(now.agentSettings, now.customAgents).map(agent => ({ id: agent.id, label: agent.label })),
        worktrees: snapshot.repos.flatMap(repo => repo.worktrees.map(worktree => ({ path: worktree.path, label: `${repo.name}: ${worktree.branch ?? worktree.path}` }))),
        tabs: now.snapshot.tiles.map(tile => ({ id: tile.id, title: tile.title, kind: tile.kind })),
      }
    }
    return new PaletteState({
      items: () => buildPaletteItems(actions, view(), notify),
      config: () => latest.current.config.getSnapshot(),
      searchFiles: createFileSearch(
        deps.gitApi,
        () => (latest.current.groupKey === GLOBAL_GROUP ? latest.current.shell.getSnapshot().selectedPath : latest.current.groupKey),
        (worktree, file) => { actions.openFile(worktree, file) },
      ),
    })
    // The palette is created once; everything it reads goes through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => startPaletteShortcut(window, () => { palette.toggle() }), [palette])
  useEffect(() => deps.config.subscribe(() => { palette.refresh() }), [palette, deps.config])
  // What exists changed under an open palette (a tab opened, an agent turned off): list it again.
  useEffect(() => { palette.refresh() }, [palette, deps.snapshot, deps.agentSettings, deps.customAgents])
  useEffect(() => deps.tabTypes.subscribe(() => { palette.refresh() }), [palette, deps.tabTypes])

  return palette
}
