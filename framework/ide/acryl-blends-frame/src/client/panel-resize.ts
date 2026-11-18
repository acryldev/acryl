/**
 * The panels' resize rule, from the owner's T009: a panel is dragged by its inner edge; the centre (the app) keeps at least 360px, a panel stays
 * between 180px and 60% of the window, and a double-click puts the default width back. The rule is a pure function so the drag and the render agree:
 * the frame stores a width, and what is on screen is that width clamped to what the window allows now (a window that shrank must not squeeze the app).
 */

export type PanelSide = 'left' | 'right'

export interface PanelWidths {
  readonly left: number
  readonly right: number
}

/** The mockup's widths: what a double-click restores, and what a panel has the first time. */
export const DEFAULT_PANEL_WIDTHS: PanelWidths = Object.freeze({ left: 248, right: 412 })

export const PANEL_MIN_WIDTH = 180
export const CENTRE_MIN_WIDTH = 360
export const PANEL_MAX_SHARE = 0.6

/**
 * `want` clamped to the panel's range. `otherWidth` is the other panel as it is on screen (0 when it is closed): the centre always keeps
 * {@link CENTRE_MIN_WIDTH} while the window is wide enough for both minimums, and a panel never takes more than {@link PANEL_MAX_SHARE} of the window.
 * A window too narrow for the minimums leaves the panels at {@link PANEL_MIN_WIDTH}, the way the mockup does.
 */
export function clampPanelWidth(want: number, windowWidth: number, otherWidth: number): number {
  const max = Math.min(windowWidth * PANEL_MAX_SHARE, windowWidth - otherWidth - CENTRE_MIN_WIDTH)
  return Math.round(Math.max(PANEL_MIN_WIDTH, Math.min(max, want)))
}

/**
 * What the frame shows for the stored widths: a closed panel is 0 and keeps its stored width for when it opens again; the left panel is settled
 * first, the right one then against what the left really takes, so the two clamps together never add up past the window.
 */
export function resolvePanelWidths(stored: PanelWidths, open: { readonly left: boolean; readonly right: boolean }, windowWidth: number): PanelWidths {
  const left = open.left ? clampPanelWidth(stored.left, windowWidth, open.right ? stored.right : 0) : 0
  const right = open.right ? clampPanelWidth(stored.right, windowWidth, left) : 0
  return { left, right }
}
