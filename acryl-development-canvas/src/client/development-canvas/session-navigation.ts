import { DevelopmentCanvasState } from './state.ts'

export interface CanvasSessionNavigationProjection {
  readonly current: string | undefined
  readonly blank: boolean | undefined
}

/**
 * Keep DSH session navigation visible inside the Canvas tab workspace.
 * Re-selecting a blank session is the New Session signal even when its id is
 * unchanged. Ordinary updates to a non-blank current session leave the active
 * Canvas tool tab alone.
 */
export function synchronizeCanvasWithSessionNavigation(
  canvas: DevelopmentCanvasState,
  previousCurrent: string | undefined,
  projection: CanvasSessionNavigationProjection,
): string | undefined {
  if (
    projection.current !== previousCurrent
    || projection.current === undefined
    || projection.blank === true
  ) {
    canvas.addTile('chat')
  }
  return projection.current
}
