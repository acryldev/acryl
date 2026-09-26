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
  /** Render the upstream sidebar (brand, sessions, settings) inside a contribution that wraps it. */
  renderUpstream(): ReactNode
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
    /** Replaceable left-pane surface; by default it only renders the upstream `sidebar`. */
    'desktop.sidebar': { kind: 'single'; scope: 'root'; owner: DesktopSidebarSurfaceOwnerProps }
    /** Upstream sidebar hosted by the desktop advanced frame. */
    'sidebar': { kind: 'single'; scope: 'root'; owner: DesktopSidebarOwnerProps }
    /** Unchanged upstream conversation surface. */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: Record<never, never> }
    /** The right panel, hosted like upstream DSH's `rightbar`: the right sidebar registers here. */
    'rightbar': { kind: 'single'; scope: 'session'; owner: DesktopRightbarOwnerProps }
    /** Frame-wide additive overlays. */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}
