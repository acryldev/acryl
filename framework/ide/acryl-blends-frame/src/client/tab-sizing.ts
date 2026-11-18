/**
 * The right panel's tab strip sizing (412px wide beside the canvas): every open chat has a tab, so several chats and tools have to share that width instead
 * of running past its edge and clipping their labels. Each tab takes an equal share of the strip between a minimum and a maximum; a label that does not fit
 * ellipsizes inside its tab, the model or agent kind ("DeepSeek", "PTY") is dropped when the share is too narrow for it, and when even the minimums do not
 * fit the strip scrolls with the tabs at the minimum. The rule is pure so the one-tab case and the crowded ones are checked without a browser.
 */

export interface TabSizingOptions {
  /** The least a tab may take; below this the strip scrolls. */
  readonly min?: number
  /** The most one tab takes, however wide the panel. */
  readonly max?: number
  /** The gap between tabs. */
  readonly gap?: number
  /** The + button at the strip's right edge, which keeps its width. */
  readonly plus?: number
  /** The narrowest tab that still has room for its kind beside the label. */
  readonly kindMin?: number
}

/** One tab's size and the strip's behavior at a given width. */
export interface TabSizing {
  /** The most one tab may take. */
  readonly width: number
  /** Whether the strip has to scroll: the minimums do not fit. */
  readonly scroll: boolean
  /** Whether a tab shows its kind ("DeepSeek", "PTY") beside the label. */
  readonly kind: boolean
}

/** The frame's sizes: five tabs fit the 412px panel at the minimum without scrolling. */
export const TAB_SIZING: Required<TabSizingOptions> = { min: 72, max: 168, gap: 2, plus: 26, kindMin: 96 }

/** The tab strip's sizing for `count` tabs in a strip `stripWidth` px wide. */
export function tabSizing(stripWidth: number, count: number, options: TabSizingOptions = {}): TabSizing {
  const min = options.min ?? TAB_SIZING.min
  const max = options.max ?? TAB_SIZING.max
  const gap = options.gap ?? TAB_SIZING.gap
  const plus = options.plus ?? TAB_SIZING.plus
  const kindMin = options.kindMin ?? TAB_SIZING.kindMin
  if (count <= 0) return { width: max, scroll: false, kind: true }
  const room = Math.max(0, stripWidth - plus - gap * Math.max(0, count - 1))
  const share = Math.floor(room / count)
  const width = Math.min(max, Math.max(min, share))
  return { width, scroll: share < min, kind: width >= kindMin }
}
