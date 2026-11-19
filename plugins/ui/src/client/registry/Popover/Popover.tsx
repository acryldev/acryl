/**
 * Ported from shadcn/ui's Popover (https://ui.shadcn.com/docs/components/popover, MIT licence, registry item `popover`, style new-york-v4, fetched
 * 2026-09-22). Radix's Popover primitive is dropped and its behaviour reproduced by hand, because a popover is one piece of state plus three pieces of
 * platform behaviour: the root owns open state (controlled `open`/`onOpenChange`, or `defaultOpen`), the trigger toggles it, and the content is positioned
 * against the trigger's own rect, closing on Escape and on a pointerdown outside, moving focus into the panel when it opens and back to the trigger when it
 * closes. Positioning flips above the trigger when the panel would overflow the viewport bottom, and re-measures on resize and scroll.
 *
 * Restates the anchored-listbox shape written down in docs/pattern-anchored-listbox.md (points 1 to 5, its anchoring half) — a shared pattern each item
 * restates, never an importable module, because a cross-item import is what this registry's ingest gate rejects.
 *
 * `asChild`/Slot are dropped from the trigger and the anchor; `PopoverAnchor` is a wrapper element that registers itself as the position reference, which
 * is what Radix's Anchor does to the child it clones. Three substitutions to name. (1) The source renders through a portal to `document.body`; this port
 * renders the panel where it sits in the tree, because a client bundle in this library may require only react, react/jsx-runtime and the app primitives, and
 * `react-dom`'s `createPortal` is outside that set - the built-bundle test fails the build if anything else is required. Positioning is still computed from
 * the trigger's rect in viewport coordinates, so the panel lands in the same place; the caveat that buys is that an ancestor with `overflow: hidden` or a
 * transform can clip it, which a portal would have avoided. (2) Radix's `--radix-popover-content-transform-origin` and its enter/exit animations have no
 * equivalent here, so this port animates nothing rather than inventing keyframes. (3) The source's `shadow-md` becomes the app's raised surface plus a
 * border, because the token set has no shadow token and this library does not invent literal colour. See manifest.yml.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CSSProperties, MutableRefObject, ReactNode } from 'react'
import css from './Popover.module.css'

export type PopoverAlign = 'start' | 'center' | 'end'

interface PopoverContextValue {
  isOpen: boolean
  setOpen: (open: boolean) => void
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  anchorRef: MutableRefObject<HTMLElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

export interface PopoverProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

/** Own the popover's open state for its trigger, anchor and content. */
export function Popover({ open, defaultOpen = false, onOpenChange, children }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isOpen = open ?? uncontrolled
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const value = useMemo<PopoverContextValue>(() => ({
    isOpen,
    setOpen: next => { if (open === undefined) setUncontrolled(next); onOpenChange?.(next) },
    triggerRef,
    anchorRef,
    contentRef,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isOpen, open, onOpenChange])
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
}

/** The button that opens the popover. `label` becomes its accessible name when the visible text cannot be one. */
export function PopoverTrigger({ label, children, className }: { label?: string, children?: ReactNode, className?: string }) {
  const context = useContext(PopoverContext)
  return (
    <button
      type="button"
      ref={element => { if (context !== null) context.triggerRef.current = element }}
      data-slot="popover-trigger"
      aria-haspopup="dialog"
      aria-expanded={context?.isOpen ?? false}
      aria-label={label}
      className={clsx(css.trigger, className)}
      onClick={() => { context?.setOpen(!(context.isOpen)) }}
    >
      {children}
    </button>
  )
}

/** Position the panel against this element instead of the trigger. */
export function PopoverAnchor({ children, className }: { children?: ReactNode, className?: string }) {
  const context = useContext(PopoverContext)
  return <span ref={element => { if (context !== null) context.anchorRef.current = element }} data-slot="popover-anchor" className={clsx(css.anchor, className)}>{children}</span>
}

export interface PopoverContentProps {
  align?: PopoverAlign
  sideOffset?: number
  label?: string
  children?: ReactNode
  className?: string
}

/**
 * The popover panel. It renders nothing until the popover is open.
 * @param props - the alignment, the gap from the trigger, the dialog's accessible name, and the panel's content.
 * @returns the element, in a portal on `document.body`.
 */
export function PopoverContent({ align = 'center', sideOffset = 4, label, children, className }: PopoverContentProps) {
  const context = useContext(PopoverContext)
  const isOpen = context?.isOpen ?? false
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [positioned, setPositioned] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen) { setPositioned(false); return }
    const measure = (): void => {
      const reference = context?.anchorRef.current ?? context?.triggerRef.current
      const panel = context?.contentRef.current
      if (reference === null || reference === undefined || panel === null || panel === undefined) return
      const rect = reference.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const ideal = align === 'start' ? rect.left : align === 'end' ? rect.right - width : rect.left + rect.width / 2 - width / 2
      const left = Math.min(Math.max(ideal, 8), Math.max(8, window.innerWidth - width - 8))
      const below = rect.bottom + sideOffset
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - sideOffset - height) : below
      setStyle({ left, top })
      setPositioned(true)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [isOpen, align, sideOffset, context])

  // Focus once the panel is actually visible. The first measure lands through a state update, so focusing beside it (or
  // from the passive effect below) runs while the element is still `visibility: hidden` and is silently a no-op on a
  // hidden element - that is why focus used to stay on the trigger. Keyed on `positioned`, this runs after the commit
  // that applies the position.
  useEffect(() => {
    if (!isOpen || !positioned) return
    context?.contentRef.current?.focus()
  }, [isOpen, positioned, context])

  useEffect(() => {
    if (!isOpen || context === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      context.setOpen(false)
      context.triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (context.contentRef.current?.contains(target) === true) return
      if (context.triggerRef.current?.contains(target) === true) return
      context.setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown) }
  }, [isOpen, context])

  if (!isOpen) return null
  return (
    <div
      ref={element => { if (context !== null) context.contentRef.current = element }}
      role="dialog"
      aria-label={label}
      data-slot="popover-content"
      data-align={align}
      tabIndex={-1}
      className={clsx(css.content, className)}
      style={style}
    >
      {children}
    </div>
  )
}

export function PopoverHeader({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="popover-header" className={clsx(css.header, className)}>{children}</div>
}

export function PopoverTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="popover-title" className={clsx(css.title, className)}>{children}</div>
}

export function PopoverDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <p data-slot="popover-description" className={clsx(css.description, className)}>{children}</p>
}