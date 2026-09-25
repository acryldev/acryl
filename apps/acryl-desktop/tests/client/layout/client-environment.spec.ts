import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { apply } from '../../../src/client/index.ts'
import { provideDesktopLayout } from '../../../src/client/layout/layout-service.ts'
import { parseDesktopClientEnvironment } from '../../../src/client/environment.ts'
import {
  computeDesktopColumns, DesktopLayoutState, MACOS_SIDEBAR_COLLAPSED, SIDEBAR_COLLAPSED, solveFrame,
} from '../../../src/client/layout/layout-state.ts'
import { installAdvancedStyles } from '../../../src/client/layout/styles.ts'
import {
  MACOS_DRAG_REGION_HEIGHT,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHT_SAFE_WIDTH,
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_TITLEBAR_HEIGHT,
} from '../../../src/shell/window-chrome.ts'

describe('desktop client environment', () => {
  it('does not activate desktop effects for an ordinary browser URL', () => {
    vi.stubGlobal('window', { location: { hash: '' } })
    const effect = vi.fn()

    try {
      expect(parseDesktopClientEnvironment('')).toBeUndefined()
      apply({ effect } as unknown as ClientContext)
      expect(effect).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts the Electron-owned kebab fragment markers', () => {
    expect(parseDesktopClientEnvironment('#dsh-desktop-mode=advanced&dsh-desktop-platform=darwin'))
      .toEqual({ mode: 'advanced', platform: 'darwin' })
    expect(parseDesktopClientEnvironment('#dsh-desktop-platform=win32&dsh-desktop-mode=compatibility'))
      .toEqual({ mode: 'compatibility', platform: 'win32' })
  })

  it.each([
    ['#dsh-desktop-mode=glass&dsh-desktop-platform=darwin', 'dsh-desktop-mode'],
    ['#dsh-desktop-mode=advanced', 'dsh-desktop-platform'],
    ['#dsh-desktop-platform=darwin', 'dsh-desktop-mode'],
    ['#dsh-desktop-mode=advanced&dsh-desktop-platform=android', 'dsh-desktop-platform'],
  ])('fails loud for malformed marker %s', (hash, field) => {
    expect(() => parseDesktopClientEnvironment(hash)).toThrow(field)
  })
})

describe('advanced desktop layout', () => {
  it('owns native caption geometry without targeting feature headers', () => {
    expect(MACOS_TITLEBAR_HEIGHT).toBe(20)
    expect(MACOS_DRAG_REGION_HEIGHT).toBe(32)
    expect(MACOS_DRAG_REGION_HEIGHT).toBeGreaterThan(MACOS_TITLEBAR_HEIGHT)
    expect(WINDOWS_TITLEBAR_HEIGHT).toBe(32)
    let css = ''
    const remove = vi.fn()
    const style = {
      dataset: {},
      get textContent() { return css },
      set textContent(value: string) { css = value },
      remove,
    }
    const appendChild = vi.fn()
    vi.stubGlobal('document', {
      createElement: () => style,
      head: { appendChild },
    })

    try {
      const dispose = installAdvancedStyles()
      expect(css).toMatch(/\.dshDesktopFrame \{[^}]*transition: grid-template-columns var\(--ds-transition-duration-slow\) var\(--ds-ease-in-out\);/)
      expect(css).toMatch(/\.dshDesktopFrame\[data-dragging\] \{ transition: none; \}/)
      expect(css).toMatch(/\.dshDesktopFrame\[data-details-collapsed\] \.dshDesktopDetailsSurface \{ border-left: none; \}/)
      expect(css).toMatch(/\.dshDesktopResizeHandle \{[^}]*transition: left var\(--ds-transition-duration-slow\) var\(--ds-ease-in-out\);/)
      expect(css).toMatch(/\.dshDesktopFrame\[data-dragging\] \.dshDesktopResizeHandle \{ transition: none; \}/)
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.dshDesktopFrame,[\s\S]*\.dshDesktopResizeHandle \{ transition: none !important; \}/)
      expect(css).toMatch(/\.dshDesktopSidebarSurface\s*\{[^}]*--dsw-specific-sidebar-fill:\s*transparent;/)
      expect(css).toMatch(/data-desktop-platform="darwin"\]\[data-sidebar-collapsed\][^{]*\.dshDesktopUpstreamSidebar \{[^}]*width:\s*56px;[^}]*margin:\s*0 auto;/)
      expect(css).toMatch(new RegExp(`data-desktop-platform="darwin"\\] \\.dshDesktopUpstreamSidebar \\{[^}]*padding-top: ${MACOS_TITLEBAR_HEIGHT}px;[^}]*-webkit-app-region: no-drag;`))
      expect(css).toContain(`grid-template-rows: ${MACOS_TITLEBAR_HEIGHT}px minmax(0, 1fr)`)
      expect(css).toMatch(/\.dshDesktopFrame\[data-desktop-platform="darwin"\] \.dshDesktopSidebarSurface \{[^}]*grid-row: 1 \/ -1;[^}]*-webkit-app-region: no-drag;/)
      expect(css).toMatch(/\.dshDesktopFrame\[data-desktop-platform="darwin"\] \.dshDesktopConversationSurface,\s*\.dshDesktopFrame\[data-desktop-platform="darwin"\] \.dshDesktopDetailsSurface \{ grid-row: 2; \}/)
      expect(css).toMatch(new RegExp(`data-desktop-platform="darwin"\\] \\.dshDesktopSidebarSurface::before \\{[^}]*left: ${MACOS_TRAFFIC_LIGHT_SAFE_WIDTH}px;[^}]*height: ${MACOS_DRAG_REGION_HEIGHT}px;[^}]*-webkit-app-region: drag;`))
      expect(css).not.toMatch(/data-desktop-platform="darwin"\] \.dshDesktopSidebarSurface::before \{[^}]*z-index:/)
      expect(css).toMatch(/\.dshDesktopMacCaptionRow \{[^}]*position: relative;[^}]*grid-column: 2 \/ -1;[^}]*grid-row: 1;/)
      expect(css).toMatch(new RegExp(`\\.dshDesktopMacCaptionRow::before \\{[^}]*height: ${MACOS_DRAG_REGION_HEIGHT}px;[^}]*-webkit-app-region: drag;`))
      expect(css).not.toMatch(/\.dshDesktopMacCaptionRow::before \{[^}]*z-index:/)
      expect(css).not.toMatch(/data-desktop-platform="darwin"\] \.dshDesktopSidebarSurface \{[^}]*-webkit-app-region:\s*drag;/)
      expect(css).not.toContain('[data-phase')
      expect(css).toMatch(/html:has\(\[aria-modal="true"\]\) \.dshDesktopMacCaptionRow::before,[\s\S]*html:has\(\[aria-modal="true"\]\) \.dshDesktopSidebarSurface::before \{ -webkit-app-region: no-drag !important; \}/)
      expect(css).toContain(`grid-template-rows: ${WINDOWS_TITLEBAR_HEIGHT}px minmax(0, 1fr)`)
      expect(css).toMatch(/\.dshDesktopFrame\[data-desktop-platform="win32"\] \.dshDesktopSidebarSurface \{ grid-row: 1 \/ -1; \}/)
      expect(css).toMatch(/\.dshDesktopFrame\[data-desktop-platform="win32"\] \.dshDesktopConversationSurface,\s*\.dshDesktopFrame\[data-desktop-platform="win32"\] \.dshDesktopDetailsSurface \{ grid-row: 2; \}/)
      expect(css).toMatch(/\.dshDesktopWindowsCaptionRow \{[^}]*grid-column: 2 \/ -1;[^}]*grid-row: 1;/)
      expect(css).toMatch(new RegExp(`\\.dshDesktopWindowsCaptionRow::before \\{[^}]*inset: 0 ${WINDOWS_CAPTION_CONTROLS_WIDTH}px 0 0;[^}]*-webkit-app-region: drag;`))
      expect(css).not.toMatch(/data-desktop-platform="win32"[^{}]*header[^{}]*\{[^}]*padding-right/)
      expect(appendChild).toHaveBeenCalledWith(style)
      dispose()
      expect(remove).toHaveBeenCalledOnce()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('releases the Cordis layout service with its owning effect', () => {
    let disposed = false
    const ctx = {
      reflect: {
        provide: (name: string, value: unknown) => {
          expect(name).toBe('layout')
          expect(value).toBeInstanceOf(DesktopLayoutState)
          return () => { disposed = true }
        },
      },
    } as unknown as ClientContext

    const dispose = provideDesktopLayout(ctx, new DesktopLayoutState())
    expect(disposed).toBe(false)
    dispose()
    expect(disposed).toBe(true)
  })

  it('uses the compatibility rail on Windows and the wider desktop rail on macOS', () => {
    expect(computeDesktopColumns(1440, 0, 0)).toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1384, details: 0 })
    expect(computeDesktopColumns(1440, 0, 0, MACOS_SIDEBAR_COLLAPSED))
      .toEqual({ sidebar: MACOS_SIDEBAR_COLLAPSED, center: 1350, details: 0 })
    expect(SIDEBAR_COLLAPSED).toBe(56)
    expect(MACOS_SIDEBAR_COLLAPSED).toBe(90)
  })

  it('publishes the right panel transitions the upstream right sidebar reports', () => {
    const layout = new DesktopLayoutState()
    layout.setViewport(1440)
    const snapshots: object[] = []
    layout.subscribe(() => { snapshots.push(layout.getSnapshot()) })
    layout.toggleSidebar()
    layout.openRightbar(true, false)
    layout.closeRightbar()
    expect(snapshots).toEqual([
      { sidebar: 0, details: 0, narrow: false, narrowExpanded: false, detailsShown: false, detailsTrack: false, detailsFullscreen: false },
      { sidebar: 0, details: 648, narrow: false, narrowExpanded: false, detailsShown: true, detailsTrack: true, detailsFullscreen: false },
      { sidebar: 0, details: 648, narrow: false, narrowExpanded: false, detailsShown: false, detailsTrack: false, detailsFullscreen: false },
    ])
  })

  it('ignores a repeated report and a close while already closed', () => {
    const layout = new DesktopLayoutState()
    let count = 0
    layout.subscribe(() => { count += 1 })
    layout.closeRightbar()
    layout.openRightbar(true, false)
    layout.openRightbar(true, false)
    layout.closeRightbar()
    layout.closeRightbar()
    expect(count).toBe(2)
  })

  it('keeps the compatibility names working', () => {
    const layout = new DesktopLayoutState()
    layout.openDetails()
    expect(layout.getSnapshot()).toMatchObject({ detailsShown: true, detailsTrack: true, detailsFullscreen: false })
    layout.closeDetails()
    expect(layout.getSnapshot()).toMatchObject({ detailsShown: false })
  })

  it('opens fullscreen without a docked track when the window is too small to dock', () => {
    const layout = new DesktopLayoutState()
    layout.setViewport(700)
    layout.openRightbar(false, true)
    expect(layout.getSnapshot()).toMatchObject({ detailsShown: true, detailsTrack: false, detailsFullscreen: true })
  })

  it('limits and remembers the panel width the user drags to', () => {
    const layout = new DesktopLayoutState()
    layout.setViewport(1000)
    layout.setDetails(50)
    expect(layout.getSnapshot().details).toBe(300)
    layout.setDetails(5000)
    expect(layout.getSnapshot().details).toBe(700)
    layout.setDetails(420)
    expect(layout.getSnapshot().details).toBe(420)
  })

  it('solves columns like upstream DSH: 400px protected for the conversation, panel shrinks or drops', () => {
    // Room: 1440 - 280 - 400 = 760, so a 648px request fits.
    expect(computeDesktopColumns(1440, 280, 648)).toEqual({ sidebar: 280, center: 512, details: 648 })
    // Narrower: 1000 - 280 - 400 = 320 available, request 450 is cut to 320.
    expect(computeDesktopColumns(1000, 280, 450)).toEqual({ sidebar: 280, center: 400, details: 320 })
    // No room for even the 300px minimum beside an expanded sidebar: no docked track.
    expect(computeDesktopColumns(900, 280, 405)).toEqual({ sidebar: 280, center: 620, details: 0 })
    // With the sidebar on its rail the same window does have room.
    expect(computeDesktopColumns(900, 0, 405, MACOS_SIDEBAR_COLLAPSED)).toEqual({ sidebar: 90, center: 405, details: 405 })
    // A request of 0 means no track at all.
    expect(computeDesktopColumns(1440, 280, 0).details).toBe(0)
  })

  it('tells the right panel the room it would have docked, so it can choose docked or fullscreen', () => {
    const closed = new DesktopLayoutState().getSnapshot()
    // 1400 window, 280 sidebar, 400 protected center: 720 available; the default request is 45% = 630.
    expect(solveFrame(1400, closed, SIDEBAR_COLLAPSED).rightbar).toEqual({ width: 630, viewportWidth: 1400, canShow: true })
    // Closed panels get no grid column.
    expect(solveFrame(1400, closed, SIDEBAR_COLLAPSED).columns.details).toBe(0)
    // A narrow window folds the sidebar to its rail, which is what makes room for the panel.
    expect(solveFrame(900, closed, SIDEBAR_COLLAPSED).rightbar.canShow).toBe(true)
    // Below the rail's own limit there is no docked room: the panel must go fullscreen.
    expect(solveFrame(700, closed, SIDEBAR_COLLAPSED).rightbar).toEqual({ width: 0, viewportWidth: 700, canShow: false })
  })

  it('gives the panel a grid column only when it asks to be docked, and none while fullscreen', () => {
    const layout = new DesktopLayoutState()
    layout.setViewport(1400)
    layout.openRightbar(true, false)
    expect(solveFrame(1400, layout.getSnapshot(), SIDEBAR_COLLAPSED).columns).toEqual({ sidebar: 280, center: 490, details: 630 })
    layout.openRightbar(false, true)
    expect(solveFrame(1400, layout.getSnapshot(), SIDEBAR_COLLAPSED).columns.details).toBe(0)
    layout.closeRightbar()
    expect(solveFrame(1400, layout.getSnapshot(), SIDEBAR_COLLAPSED).columns.details).toBe(0)
  })

  it('lets the rail re-expand without losing its wide preference on narrow windows', () => {
    const layout = new DesktopLayoutState()
    layout.setNarrow(true)
    expect(layout.getSnapshot()).toMatchObject({ sidebar: 280, narrow: true, narrowExpanded: false })
    layout.toggleSidebar()
    expect(layout.getSnapshot()).toMatchObject({ sidebar: 280, narrow: true, narrowExpanded: true })
    layout.setNarrow(false)
    expect(layout.getSnapshot()).toMatchObject({ sidebar: 280, narrow: false, narrowExpanded: false })
  })
})
