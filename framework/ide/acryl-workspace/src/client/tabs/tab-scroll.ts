/** Pure rules for the horizontally scrollable tab strip. */

export interface ScrollGeometry {
  readonly scrollLeft: number
  readonly clientWidth: number
  readonly scrollWidth: number
}

/** Which sides still hide tabs (a 1px slack absorbs sub-pixel rounding). */
export function hiddenEdges(g: ScrollGeometry): { readonly start: boolean; readonly end: boolean } {
  return {
    start: g.scrollLeft > 1,
    end: g.scrollLeft + g.clientWidth < g.scrollWidth - 1,
  }
}

/**
 * A mouse wheel only scrolls vertically, which a tab strip cannot use, so a mostly-vertical wheel turn
 * becomes a horizontal scroll. A trackpad (or shift) already sends horizontal deltas and is left alone.
 * @returns the horizontal amount to scroll by, or null when the event should keep its default behavior.
 */
export function wheelToScroll(deltaX: number, deltaY: number): number | null {
  if (Math.abs(deltaY) <= Math.abs(deltaX) || deltaY === 0) return null
  return deltaY
}

/** @returns the scrollLeft that brings a tab fully into view with a little margin, or null when it already is. */
export function scrollToReveal(g: ScrollGeometry, tabLeft: number, tabWidth: number, margin = 24): number | null {
  if (tabLeft - margin < g.scrollLeft) return Math.max(0, tabLeft - margin)
  const right = tabLeft + tabWidth + margin
  if (right > g.scrollLeft + g.clientWidth) return right - g.clientWidth
  return null
}
