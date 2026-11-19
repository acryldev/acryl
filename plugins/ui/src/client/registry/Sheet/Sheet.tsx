/**
 * Ported from shadcn/ui's Sheet (https://ui.shadcn.com/docs/components/sheet, MIT licence, registry item `sheet`, style new-york-v4, fetched
 * 2026-09-22). A panel that slides in from an edge: the root owns open state, the trigger toggles it, the overlay and the panel are
 * positioned from the side, and Escape, an overlay press or the close button dismisses it.
 *
 * Radix's Dialog primitive is dropped and its behaviour written by hand, the same way this library's Popover replaces Radix's: open state in the
 * root (controlled or defaultOpen), focus onto the panel as it opens and back to the trigger on close, and Tab wrapping inside the panel so a
 * modal sheet cannot be tabbed out of. TWO THINGS ARE NOT CARRIED OVER, stated rather than hidden. (1) There is no portal: a client bundle here
 * may require only react, react/jsx-runtime and the app primitives, and react-dom's createPortal is outside that set (the built-bundle test fails
 * the build otherwise), so `SheetPortal` does not exist and the panel renders where it sits in the tree - it lands in the same place because it is
 * position: fixed, but an ancestor with `overflow: hidden` or a transform can clip it. (2) The page behind is not made inert, so assistive tech can
 * still reach it while the sheet is open; Radix marks the rest aria-hidden. Closing that needs either the app's Modal - which is centred by design,
 * with its panel styling in DSH CSS, so it cannot become a side sheet - or an inert-based pass over the app root, which is a product decision, not a
 * port decision. lucide-react's XIcon is replaced by a plain inline SVG. See manifest.yml.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { MutableRefObject, ReactNode } from 'react'
import css from './Sheet.module.css'

export type SheetSide = 'top' | 'right' | 'bottom' | 'left'

interface SheetContextValue {
  isOpen: boolean
  setOpen: (open: boolean) => void
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
}

const SheetContext = createContext<SheetContextValue | null>(null)

export interface SheetProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

/** Own the sheet's open state for its trigger and panel. */
export function Sheet({ open, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isOpen = open ?? uncontrolled
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const value = useMemo<SheetContextValue>(() => ({
    isOpen,
    setOpen: next => { if (open === undefined) setUncontrolled(next); onOpenChange?.(next) },
    triggerRef,
    contentRef,
  }), [isOpen, open, onOpenChange])
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

/** The button that opens the sheet. */
export function SheetTrigger({ label, children, className }: { label?: string, children?: ReactNode, className?: string }) {
  const context = useContext(SheetContext)
  return (
    <button
      type="button"
      ref={element => { if (context !== null) context.triggerRef.current = element }}
      data-slot="sheet-trigger"
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

/** A button inside the sheet that dismisses it. */
export function SheetClose({ label, children, className }: { label?: string, children?: ReactNode, className?: string }) {
  const context = useContext(SheetContext)
  return (
    <button type="button" data-slot="sheet-close" aria-label={label} className={className} onClick={() => { context?.setOpen(false) }}>
      {children}
    </button>
  )
}

export interface SheetContentProps {
  side?: SheetSide
  showCloseButton?: boolean
  label?: string
  children?: ReactNode
  className?: string
}

/** The sheet's overlay. It renders nothing while the sheet is closed. */
export function SheetOverlay({ className }: { className?: string }) {
  const context = useContext(SheetContext)
  if (context?.isOpen !== true) return null
  return <div data-slot="sheet-overlay" className={clsx(css.overlay, className)} onClick={() => { context.setOpen(false) }} />
}

/**
 * The sliding panel, with its overlay. Renders nothing until the sheet is open.
 * @param props - which edge it slides from, whether to show the close button, the dialog's accessible name, and the content.
 * @returns the element.
 */
export function SheetContent({ side = 'right', showCloseButton = true, label, children, className }: SheetContentProps) {
  const context = useContext(SheetContext)
  const isOpen = context?.isOpen ?? false

  // Focus lands once the panel is in the DOM; the panel is CSS-positioned, so unlike Popover there is no measure for it to wait on.
  useEffect(() => {
    if (!isOpen || context === null) return
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
  return (
    <>
      <SheetOverlay />
      <div
        ref={element => { if (context !== null) context.contentRef.current = element }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-slot="sheet-content"
        data-side={side}
        tabIndex={-1}
        className={clsx(css.content, css[side], className)}
      >
        {children}
        {showCloseButton && (
          <button type="button" data-slot="sheet-close" aria-label="Close" className={css.close} onClick={() => { context?.setOpen(false) }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            <span className={css.srOnly}>Close</span>
          </button>
        )}
      </div>
    </>
  )
}

export function SheetHeader({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="sheet-header" className={clsx(css.header, className)}>{children}</div>
}

export function SheetFooter({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="sheet-footer" className={clsx(css.footer, className)}>{children}</div>
}

export function SheetTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <h3 data-slot="sheet-title" className={clsx(css.title, className)}>{children}</h3>
}

export function SheetDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <p data-slot="sheet-description" className={clsx(css.description, className)}>{children}</p>
}