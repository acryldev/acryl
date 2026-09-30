import type { ReactNode } from 'react'

/** Main-surface interface offered by the desktop advanced frame. */
export interface DesktopMainOwnerProps {
  /** Render the upstream conversation inside a workspace contribution. */
  renderConversation(): ReactNode
}

/** Sidebar geometry passed by the desktop root slot. */
export interface DesktopSidebarOwnerProps {
  /** Whether the sidebar is showing its compact rail. */
  collapsed: boolean
  /** Current rendered sidebar width. */
  width: number
}

/** Left-pane surface interface offered by the desktop advanced frame. */
export interface DesktopSidebarSurfaceOwnerProps extends DesktopSidebarOwnerProps {
  /** Render the real upstream Settings trigger and dialog (`sidebar.settings`), decoupled from the rest of
   * upstream's sidebar bundle (T144-followup: there is no reason to mount that bundle's chat list, brand or
   * search just to reach the one occupant this package actually needs). */
  renderSettings(): ReactNode
  /** Toggle the sidebar's collapsed rail (T137-followup: the tree's own header needed this once it
   * became the default view - the collapse control and brand mark used to come bundled inside the
   * upstream sidebar's own chrome, which is no longer shown at all). */
  onToggleCollapse(): void
}

/** What the frame tells the right panel: the room it would get if docked, and the window width. */
export interface DesktopRightbarOwnerProps {
  /** Width of the docked panel if it were shown now (0 when there is no room). */
  width: number
  viewportWidth: number
  /** Whether the docked presentation fits; when it does not, the panel closes or goes fullscreen. */
  canShow: boolean
}

/** Public panel transitions consumed by conversation and sidebar plugins. Mirrors upstream `ILayout`. */
export interface DesktopLayoutService {
  /** Toggle the sidebar between wide and compact presentation. */
  toggleSidebar(): void
  /** The right panel is open: dock it in its own column (`track`), or let it cover the window. */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** The right panel is closed. */
  closeRightbar(): void
  /** Compatibility: open the right panel docked. */
  openDetails(): void
  /** Compatibility: close the right panel. */
  closeDetails(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Desktop-owned layout service in advanced mode. */
    layout: DesktopLayoutService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Replaceable main surface inside the desktop advanced frame. */
    'desktop.main': { kind: 'single'; scope: 'root'; owner: DesktopMainOwnerProps }
    /** Replaceable left-pane surface; by default it only renders the upstream Settings trigger. */
    'desktop.sidebar': { kind: 'single'; scope: 'root'; owner: DesktopSidebarSurfaceOwnerProps }
    /** Upstream Settings trigger + dialog (`ui-settings-general`'s `sidebar.settings` occupant),
     * rendered directly by this package's own tree - not nested inside upstream's chat-list sidebar,
     * which this package never mounts (T144-followup). */
    'sidebar.settings': { kind: 'single'; scope: 'root'; owner: { wide: boolean } }
    /** Unchanged upstream conversation surface. */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: Record<never, never> }
    /** The right panel, hosted like upstream DSH's `rightbar`: the right sidebar registers here. */
    'rightbar': { kind: 'single'; scope: 'session'; owner: DesktopRightbarOwnerProps }
    /** Frame-wide additive overlays. */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}
