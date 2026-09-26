import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contracts.ts'
import type { ShellPlatform } from './environment.ts'
import { DesktopLayoutState, MACOS_SIDEBAR_COLLAPSED, SIDEBAR_COLLAPSED, solveFrame } from './layout-state.ts'

/** Private values assembled by the advanced-shell registration. */
export interface AdvancedFrameInjected {
  /** Desktop-owned panel state exposed through the standard layout service. */
  layout: DesktopLayoutState
  /** Host platform controlling native title-bar spacing. */
  platform: ShellPlatform
}

/** Full advanced root slot props. */
export type AdvancedFrameProps = PropsRuntime<'root'>
  & PropsRenderSlots<'desktop.main' | 'desktop.sidebar' | 'sidebar' | 'conversation' | 'rightbar' | 'shell.overlay'>
  & AdvancedFrameInjected

/** Desktop-owned transparent frame around the unchanged product surfaces. */
export function AdvancedFrame({ layout, platform, renderSlot, SessionProvider }: AdvancedFrameProps) {
  const subscribeLayout = useCallback((listener: () => void) => layout.subscribe(listener), [layout])
  const readLayout = useCallback(() => layout.getSnapshot(), [layout])
  const panels = useSyncExternalStore(subscribeLayout, readLayout)
  const frameRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  useEffect(() => {
    const element = frameRef.current
    if (element === null) return
    layout.setViewport(element.getBoundingClientRect().width)
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = element.getBoundingClientRect().width
        if (width > 0) {
          setViewport(width)
          layout.setViewport(width)
        }
      })
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  const railWidth = platform === 'darwin' ? MACOS_SIDEBAR_COLLAPSED : SIDEBAR_COLLAPSED
  const { narrow, collapsed, normal, columns, rightbar } = solveFrame(viewport, panels, railWidth)
  useEffect(() => { layout.setNarrow(narrow) }, [layout, narrow])
  // macOS keeps a wider native rail around the centered upstream sidebar,
  // while the public owner contract still reports the rendered 56px rail.
  const sidebarOwnerWidth = collapsed ? SIDEBAR_COLLAPSED : columns.sidebar
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const normalRef = useRef(normal)
  normalRef.current = normal

  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => {
    sidebarBase.current = columnsRef.current.sidebar
    setDragging(true)
  }, [])
  const onDetailsStart = useCallback(() => {
    detailsBase.current = normalRef.current.details
    setDragging(true)
  }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    layout.setSidebar(sidebarBase.current + dx)
  }, [layout])
  const onDetailsDrag = useCallback((dx: number) => {
    layout.setDetails(detailsBase.current - dx)
  }, [layout])

  return (
    <div
      ref={frameRef}
      className="dshDesktopFrame"
      data-desktop-platform={platform}
      data-sidebar-collapsed={collapsed || undefined}
      data-details-collapsed={columns.details === 0 || undefined}
      data-details-fullscreen={panels.detailsFullscreen || undefined}
      data-dragging={dragging || undefined}
      style={{ gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` }}
    >
      {platform === 'darwin' && <div className="dshDesktopMacCaptionRow" aria-hidden="true" />}
      {platform === 'win32' && <div className="dshDesktopWindowsCaptionRow" aria-hidden="true" />}
      <aside className="dshDesktopSidebarSurface">
        <div className="dshDesktopUpstreamSidebar" data-acryl-slot="sidebar">
          {renderSlot('desktop.sidebar', {
            collapsed,
            width: sidebarOwnerWidth,
            renderUpstream: () => renderSlot('sidebar', { collapsed, width: sidebarOwnerWidth }),
          })}
        </div>
      </aside>
      <main className="dshDesktopConversationSurface" data-acryl-slot="desktop.main">
        {renderSlot('desktop.main', {
          renderConversation: () => <div data-acryl-slot="conversation">{renderSlot('conversation', {})}</div>,
        })}
      </main>
      <aside className="dshDesktopDetailsSurface" data-acryl-slot="rightbar">
        {/* Strict session entry: with no session there is no surface, and the
            column is an empty zero-width track (matches ui-layout's
            AppFrame/rightbar - SessionProvider withholds the strict entry
            while no session is current instead of rendering it into a
            scope with no binding, which throws SlotAssemblyError). */}
        <SessionProvider>
          {renderSlot('rightbar', rightbar)}
        </SessionProvider>
      </aside>
      <div className="dshDesktopOverlay" data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {!collapsed && (
        <ResizeHandle
          side="sidebar"
          left={columns.sidebar}
          onStart={onSidebarStart}
          onDrag={onSidebarDrag}
          onEnd={onDragEnd}
        />
      )}
      {panels.detailsShown && !panels.detailsFullscreen && normal.details > 0 && (
        <ResizeHandle
          side="details"
          left={viewport - normal.details}
          onStart={onDetailsStart}
          onDrag={onDetailsDrag}
          onEnd={onDragEnd}
        />
      )}
    </div>
  )
}

function ResizeHandle(props: {
  side: 'sidebar' | 'details'
  left: number
  onStart: () => void
  onDrag: (dx: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = event.clientX
    latest.current = event.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  return (
    <div
      className="dshDesktopResizeHandle"
      data-side={props.side}
      data-dragging={dragging || undefined}
      style={{ left: props.left }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
