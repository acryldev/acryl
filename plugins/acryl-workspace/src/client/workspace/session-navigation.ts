import { WorkspaceState } from './state.ts'

export interface WorkspaceSessionNavigationProjection {
  readonly current: string | undefined
  readonly blank: boolean | undefined
}

/**
 * Keep DSH session navigation visible inside the Workspace tab area.
 * Re-selecting a blank session is the New Session signal even when its id is
 * unchanged. Ordinary updates to a non-blank current session leave the active
 * Workspace tool tab alone.
 */
export function synchronizeWorkspaceWithSessionNavigation(
  workspace: WorkspaceState,
  previousCurrent: string | undefined,
  projection: WorkspaceSessionNavigationProjection,
): string | undefined {
  if (
    projection.current !== previousCurrent
    || projection.current === undefined
    || projection.blank === true
  ) {
    workspace.addTile('chat')
  }
  return projection.current
}
