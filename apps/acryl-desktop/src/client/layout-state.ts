/**
 * Desktop frame layout state and column math.
 *
 * This follows the upstream DSH `AppFrame` (`@deepseek-ai/dsh-client-ui-layout`), which the advanced
 * shell replaces: a right panel that docks beside the conversation when there is room and goes
 * fullscreen when there is not, reported back by the panel through `ctx.layout.openRightbar(track,
 * fullscreen)` and `closeRightbar()`. Diverging from that protocol leaves the right sidebar with no
 * way to open.
 */

export interface DesktopLayoutSnapshot {
  /** Sidebar width preference in px; 0 means collapsed to the rail. */
  sidebar: number
  /** Right panel width preference in px; 0 means unset (it then defaults to 45% of the viewport). */
  details: number
  narrow: boolean
  narrowExpanded: boolean
  /** The panel reports it is open. */
  detailsShown: boolean
  /** The panel wants its own column (docked), rather than covering the window. */
  detailsTrack: boolean
  detailsFullscreen: boolean
}

export interface DesktopColumns {
  sidebar: number
  center: number
  details: number
}

export const SIDEBAR_COLLAPSED = 56
export const MACOS_SIDEBAR_COLLAPSED = 90
export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
export const SIDEBAR_AUTO_COLLAPSE = 1024
export const DETAILS_MIN = 300
/** The right panel may take at most this share of the window. */
export const DETAILS_MAX_RATIO = 0.7
/** First-open width of the right panel, as a share of the window. */
export const DETAILS_DEFAULT_RATIO = 0.45
/** Width protected for the conversation while the right panel is docked. */
export const CENTER_MIN = 400

/**
 * Solve the three column widths for one frame width.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = collapsed to the rail).
 * @param details - requested right panel width in px (0 = no track).
 * @param collapsedWidth - rail width, which differs per platform.
 * @returns actual widths. The right track shrinks to fit or is removed; only without it may the
 * center fall below its minimum.
 */
export function computeDesktopColumns(
  viewport: number,
  sidebar: number,
  details: number,
  collapsedWidth: number = SIDEBAR_COLLAPSED,
): DesktopColumns {
  const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const available = viewport - sidebarWidth - CENTER_MIN
  const detailsWidth = details === 0 || available < DETAILS_MIN
    ? 0
    : Math.min(available, clamp(details, DETAILS_MIN, viewport * DETAILS_MAX_RATIO))
  return { sidebar: sidebarWidth, center: Math.max(0, viewport - sidebarWidth - detailsWidth), details: detailsWidth }
}

/** What the frame decided for one width and panel state. */
export interface FrameSolution {
  readonly narrow: boolean
  /** The sidebar is showing only its rail. */
  readonly collapsed: boolean
  /** The room the right panel would have if docked now. This is what the panel is told. */
  readonly normal: DesktopColumns
  /** The columns the grid actually gets. */
  readonly columns: DesktopColumns
  /** Props for the `rightbar` slot: it decides between docked, fullscreen and closed from these. */
  readonly rightbar: { readonly width: number; readonly viewportWidth: number; readonly canShow: boolean }
}

/**
 * The frame's whole layout decision, as in upstream DSH: two solves, one for the room the panel
 * would have if docked (reported to it) and one for the columns actually laid out.
 */
export function solveFrame(viewport: number, panels: DesktopLayoutSnapshot, railWidth: number): FrameSolution {
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  const collapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = collapsed ? 0 : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const detailsPreference = panels.details === 0 ? viewport * DETAILS_DEFAULT_RATIO : panels.details
  const normal = computeDesktopColumns(
    viewport,
    !panels.detailsShown && narrow ? 0 : sidebarPreference,
    detailsPreference,
    railWidth,
  )
  const columns = computeDesktopColumns(
    viewport,
    sidebarPreference,
    panels.detailsTrack ? detailsPreference : 0,
    railWidth,
  )
  return { narrow, collapsed, normal, columns, rightbar: { width: normal.details, viewportWidth: viewport, canShow: normal.details > 0 } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export class DesktopLayoutState {
  private snapshot: DesktopLayoutSnapshot = Object.freeze({
    sidebar: SIDEBAR_DEFAULT,
    details: 0,
    narrow: false,
    narrowExpanded: false,
    detailsShown: false,
    detailsTrack: false,
    detailsFullscreen: false,
  })
  private readonly listeners = new Set<() => void>()
  private viewport = 0

  getSnapshot(): DesktopLayoutSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Report the frame width, which the default and the limits of the right panel depend on. */
  setViewport(width: number): void {
    this.viewport = width
  }

  toggleSidebar(): void {
    if (this.snapshot.narrow) {
      this.publish({ ...this.snapshot, narrowExpanded: !this.snapshot.narrowExpanded })
      return
    }
    this.publish({ ...this.snapshot, sidebar: this.snapshot.sidebar === 0 ? SIDEBAR_DEFAULT : 0 })
  }

  setNarrow(narrow: boolean): void {
    if (this.snapshot.narrow === narrow) return
    this.publish({ ...this.snapshot, narrow, narrowExpanded: false })
  }

  /**
   * The right panel reports it is open, and how it is presented. Called by the right sidebar
   * through `ctx.layout`; the frame then gives it a column (`track`) or lets it cover the window.
   */
  openRightbar(track: boolean, fullscreen: boolean): void {
    const current = this.snapshot
    if (current.detailsShown && current.detailsTrack === track && current.detailsFullscreen === fullscreen) return
    const details = current.details === 0 && this.viewport > 0
      ? Math.max(DETAILS_MIN, Math.round(this.viewport * DETAILS_DEFAULT_RATIO))
      : current.details
    this.publish({
      ...current,
      details,
      detailsShown: true,
      detailsTrack: track,
      detailsFullscreen: fullscreen,
      // Opening over a narrow window folds an expanded rail back, so the panel has the room.
      narrowExpanded: current.detailsShown ? current.narrowExpanded : false,
    })
  }

  closeRightbar(): void {
    const current = this.snapshot
    if (!current.detailsShown && !current.detailsTrack && !current.detailsFullscreen) return
    this.publish({ ...current, detailsShown: false, detailsTrack: false, detailsFullscreen: false })
  }

  /** Compatibility name for {@link openRightbar} as a docked panel. */
  openDetails(): void {
    this.openRightbar(true, false)
  }

  /** Compatibility name for {@link closeRightbar}. */
  closeDetails(): void {
    this.closeRightbar()
  }

  setSidebar(width: number): void {
    this.publish({ ...this.snapshot, sidebar: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX) })
  }

  setDetails(width: number): void {
    const max = Math.max(DETAILS_MIN, this.viewport > 0 ? this.viewport * DETAILS_MAX_RATIO : width)
    this.publish({ ...this.snapshot, details: clamp(width, DETAILS_MIN, max) })
  }

  private publish(next: DesktopLayoutSnapshot): void {
    this.snapshot = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }
}
