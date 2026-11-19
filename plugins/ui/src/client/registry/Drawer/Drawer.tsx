/**
 * Ported from shadcn/ui's Drawer (https://ui.shadcn.com/docs/components/drawer, MIT licence, registry item `drawer`, style new-york-v4, fetched
 * 2026-09-22). A sheet you can flick away: a drawer from any edge, with a drag handle on the horizontal edges and drag-to-dismiss on the panel.
 *
 * vaul is dropped and its behaviour written by hand, reusing the overlay pattern this library's Sheet port established (open state in the root, overlay
 * and panel positioned from the direction, Escape or an overlay press to dismiss, focus onto the panel and back to the trigger, Tab wrapped inside).
 * The drag is arithmetic on the panel's own rect: a press on the panel - not on a control inside it - captures the pointer, movement is projected onto
 * the axis with the sign taken from the direction, releasing past a quarter of the panel's extent dismisses it and anything shorter springs back
 * through the module's transition. TWO THINGS ARE NOT CARRIED OVER. (1) There is no portal, for the same reason Sheet has none: a client bundle here
 * may require only react, react/jsx-runtime and the app primitives, and react-dom's createPortal is outside that set, so `DrawerPortal` does not exist
 * and the panel renders in place - it lands identically because it is position: fixed, but an ancestor with overflow: hidden or a transform can clip it.
 * (2) vaul also has velocity-based dismissal, background scaling and a snap-point system; this port implements distance only, so a fast short flick
 * will spring back rather than dismiss. Both are recorded in manifest.yml rather than left to be discovered.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import css from './Drawer.module.css'

export type DrawerDirection = 'top' | 'right' | 'bottom' | 'left'

interface DrawerContextValue {
  isOpen: boolean
  setOpen: (open: boolean) => void
  direction: DrawerDirection
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export interface DrawerProps {
  open?: boolean
  defaultOpen?: boolean
  direction?: DrawerDirection
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

/** Own the drawer's open state and direction for its trigger, overlay and panel. */
export function Drawer({ open, defaultOpen = false, direction = 'bottom', onOpenChange, children }: DrawerProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isOpen = open ?? uncontrolled
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const value = useMemo<DrawerContextValue>(() => ({
    isOpen,
    direction,
    setOpen: next => { if (open === undefined) setUncontrolled(next); onOpenChange?.(next) },
    triggerRef,
    contentRef,
  }), [isOpen, direction, open, onOpenChange])
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>
}

export function DrawerTrigger({ label, children, className }: { label?: string, children?: ReactNode, className?: string }) {
  const context = useContext(DrawerContext)
  return (
    <button
      type="button"
      ref={element => { if (context !== null) context.triggerRef.current = element }}
      data-slot="drawer-trigger"
      aria-haspopup="dialog"
      aria-expanded={context?.isOpen ?? false}
      aria-label={label}
      className={className}
      onClick={() => { context?.setOpen(!(context.isOpen)) }}
    >
      {children}
    </button>
  )
}

export function DrawerClose({ label, children, className }: { label?: string, children?: ReactNode, className?: string }) {
  const context = useContext(DrawerContext)
  return <button type="button" data-slot="drawer-close" aria-label={label} className={className} onClick={() => { context?.setOpen(false) }}>{children}</button>
}

/** The drawer's overlay. Renders nothing while the drawer is closed. */
export function DrawerOverlay({ className }: { className?: string }) {
  const context = useContext(DrawerContext)
  if (context?.isOpen !== true) return null
  return <div data-slot="drawer-overlay" className={clsx(css.overlay, className)} onClick={() => { context.setOpen(false) }} />
}

export interface DrawerContentProps {
  showHandle?: boolean
  label?: string
  children?: ReactNode
  className?: string
}

/**
 * The draggable panel, with its overlay. Renders nothing until the drawer is open.
 * @param props - whether to show the drag handle, the dialog's accessible name, and the content.
 * @returns the element.
 */
export function DrawerContent({ showHandle = true, label, children, className }: DrawerContentProps) {
  const context = useContext(DrawerContext)
  const isOpen = context?.isOpen ?? false
  const direction = context?.direction ?? 'bottom'
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number, startY: number, extent: number } | null>(null)

  useEffect(() => {
    if (!isOpen || context === null) return
    setOffset(0)
    context.contentRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        context.setOpen(false)
        context.triggerRef.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const panel = context.contentRef.current
      if (panel === null) return
      const focusable = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [isOpen, context])

  if (!isOpen) return null

  const axis = direction === 'bottom' || direction === 'top' ? 'y' : 'x'
  // How far the panel has been pulled in the direction that would dismiss it, clamped at rest.
  const dismissalSign = direction === 'bottom' || direction === 'right' ? 1 : -1
  const transform = axis === 'y'
    ? { transform: `translateY(${dismissalSign * offset}px)` }
    : { transform: `translateX(${dismissalSign * offset}px)` }
  const panelStyle: CSSProperties = dragging ? { ...transform, transition: 'none' } : transform

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    // A press that starts on a control belongs to the control, not to the drag.
    if (target.closest('button, a, input, textarea, select') !== null) return
    const panel = context?.contentRef.current
    if (panel === null || panel === undefined) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { startX: event.clientX, startY: event.clientY, extent: axis === 'y' ? rect.height : rect.width }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null) return
    const delta = axis === 'y' ? event.clientY - drag.startY : event.clientX - drag.startX
    setOffset(Math.max(0, dismissalSign * delta))
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag === null) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (offset > drag.extent / 4) { context?.setOpen(false); setOffset(0); return }
    setOffset(0)
  }

  return (
    <>
      <DrawerOverlay />
      <div
        ref={element => { if (context !== null) context.contentRef.current = element }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-slot="drawer-content"
        data-direction={direction}
        data-dragging={dragging}
        data-shows-handle={showHandle && (direction === 'bottom' || direction === 'top')}
        tabIndex={-1}
        className={clsx(css.content, css[direction], className)}
        style={panelStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div data-slot="drawer-handle" className={css.handle} />
        {children}
      </div>
    </>
  )
}

export function DrawerHeader({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="drawer-header" className={clsx(css.header, className)}>{children}</div>
}

export function DrawerFooter({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="drawer-footer" className={clsx(css.footer, className)}>{children}</div>
}

export function DrawerTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <h3 data-slot="drawer-title" className={clsx(css.title, className)}>{children}</h3>
}

export function DrawerDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <p data-slot="drawer-description" className={clsx(css.description, className)}>{children}</p>
}