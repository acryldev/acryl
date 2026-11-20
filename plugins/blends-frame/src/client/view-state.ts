/**
 * The frame's own view: which panels are open, their widths and which mode it is in. Both panels open on the first run; after that the person's choice
 * is remembered in the page's storage. The frame's page is the app's own origin (its own port), so the widths are the app's own: another app has its
 * own storage, and a restart keeps them. A storage that throws (a private window, blocked site data) only costs the memory.
 */

import { DEFAULT_PANEL_WIDTHS, type PanelSide } from './panel-resize.ts'

export type FrameMode = 'build' | 'preview'

export interface FrameView {
  readonly left: boolean
  readonly right: boolean
  readonly mode: FrameMode
  /** The width the person last gave each panel; a collapsed panel keeps its own and returns at it. */
  readonly leftWidth: number
  readonly rightWidth: number
}

export const FIRST_RUN_VIEW: FrameView = Object.freeze({
  left: true,
  right: true,
  mode: 'build',
  leftWidth: DEFAULT_PANEL_WIDTHS.left,
  rightWidth: DEFAULT_PANEL_WIDTHS.right,
})

const STORAGE_KEY = 'acryl-blends-frame.view.v1'

/** A width from storage: a finite positive number, else the default (a view stored before the panels resized has none). */
function storedWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** A stored view, or the first-run view for anything absent or malformed. A stored view from before the resize keeps its panels and gets the defaults. */
export function parseStoredView(raw: string | null): FrameView {
  if (raw === null) return FIRST_RUN_VIEW
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object') return FIRST_RUN_VIEW
    const { left, right, mode, leftWidth, rightWidth } = value as Record<string, unknown>
    if (typeof left !== 'boolean' || typeof right !== 'boolean' || (mode !== 'build' && mode !== 'preview')) return FIRST_RUN_VIEW
    return Object.freeze({
      left,
      right,
      mode,
      leftWidth: storedWidth(leftWidth, DEFAULT_PANEL_WIDTHS.left),
      rightWidth: storedWidth(rightWidth, DEFAULT_PANEL_WIDTHS.right),
    })
  } catch {
    return FIRST_RUN_VIEW
  }
}

export interface ViewStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class FrameViewState {
  private view: FrameView
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: ViewStorage | undefined) {
    let raw: string | null = null
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    this.view = parseStoredView(raw)
  }

  getSnapshot(): FrameView {
    return this.view
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggleLeft(): void {
    this.publish({ ...this.view, left: !this.view.left })
  }

  toggleRight(): void {
    this.publish({ ...this.view, right: !this.view.right })
  }

  /** Show the left panel (something in it was asked for); Preview is left for Build, where the panel is. */
  showLeft(): void {
    if (!this.view.left || this.view.mode !== 'build') this.publish({ ...this.view, left: true, mode: 'build' })
  }

  /** Show the right panel (something was opened in it); Preview is left for Build, where the panel is. */
  showRight(): void {
    if (!this.view.right || this.view.mode !== 'build') this.publish({ ...this.view, right: true, mode: 'build' })
  }

  setMode(mode: FrameMode): void {
    if (this.view.mode !== mode) this.publish({ ...this.view, mode })
  }

  /** The width a drag settled on; a collapsed panel keeps it for the next time it opens. A click that settled on the same width writes nothing. */
  setWidth(side: PanelSide, width: number): void {
    const current = side === 'left' ? this.view.leftWidth : this.view.rightWidth
    if (current === width) return
    this.publish(side === 'left' ? { ...this.view, leftWidth: width } : { ...this.view, rightWidth: width })
  }

  /** Double-click on the panel's inner edge: the default width comes back. */
  resetWidth(side: PanelSide): void {
    this.setWidth(side, DEFAULT_PANEL_WIDTHS[side])
  }

  private publish(next: FrameView): void {
    this.view = Object.freeze(next)
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The view still changes; only the memory of it is lost.
    }
    for (const listener of [...this.listeners]) listener()
  }
}
