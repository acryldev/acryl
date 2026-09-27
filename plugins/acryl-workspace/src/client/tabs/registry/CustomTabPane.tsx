/**
 * The pane for a plugin's tab. When the plugin is on, its component renders and its state is saved with the
 * tab. When the plugin is off or not installed, the pane says so and the tab keeps its saved state, so turning
 * the plugin back on restores the content exactly (T012).
 */

import { useSyncExternalStore } from 'react'
import type { WorkspaceState, WorkspaceTile } from '../../canvas/state.ts'
import { MAX_TAB_STATE_LENGTH, type WorkspaceTabRegistry } from './tab-registry.ts'

export interface CustomTabPaneProps {
  readonly tile: WorkspaceTile
  readonly workspace: WorkspaceState
  readonly registry: WorkspaceTabRegistry
}

export function CustomTabPane({ tile, workspace, registry }: CustomTabPaneProps) {
  useSyncExternalStore(registry.subscribe, registry.getSnapshot)
  const type = tile.customType === undefined ? undefined : registry.get(tile.customType)
  if (type === undefined) {
    return (
      <div className="dshWorkspaceEmpty" role="status" data-missing-tab-type={tile.customType}>
        This tab needs the plugin that provides <code>{tile.customType ?? 'a tab type'}</code>. It is turned off or not installed. What is in the tab is kept, and comes back when the plugin does.
      </div>
    )
  }
  const Component = type.component
  return (
    <Component
      tileId={tile.id}
      title={tile.title}
      state={tile.customState}
      setState={(next) => { if (next.length <= MAX_TAB_STATE_LENGTH) workspace.updateTile(tile.id, { customState: next }) }}
      setTitle={(title) => { workspace.renameTile(tile.id, title) }}
    />
  )
}
