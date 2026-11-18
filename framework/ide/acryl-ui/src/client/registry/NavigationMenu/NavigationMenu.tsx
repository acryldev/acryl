/**
 * Ported from shadcn/ui's Navigation Menu (https://ui.shadcn.com/docs/components/navigation-menu, MIT licence, registry item `navigation-menu`, style
 * new-york-v4, fetched 2026-09-22). Radix's NavigationMenu is dropped and its behaviour written by hand, because a client bundle here may require only react,
 * react/jsx-runtime and the app primitives (the built-bundle test enforces it).
 *
 * Restates the anchored-listbox shape from docs/pattern-anchored-listbox.md for the parts that transfer - the panel is measured in viewport coordinates with
 * viewport clamping and a re-measure on resize and scroll, renders where it sits in the tree rather than through a portal, takes focus only once it is
 * positioned, and Escape and an outside pointerdown dismiss it. A pattern each item restates, never an importable module.
 *
 * Two things make this a navigation menu rather than a menubar, and both are the source's own deltas. (1) Delayed hover: hovering a trigger opens its panel
 * after a moment, because a pointer travelling across a bar should not flash panels on the way; once a panel is open, though, moving onto a sibling switches
 * immediately, so a reader can slide along the bar. It closes when the pointer has left both the bar and the panel for a short grace period. (2) A shared
 * panel: every item's panel is placed at the same coordinates, under the whole list, so switching items does not move the panel a reader is looking at -
 * which is what the source's viewport achieves by moving the open panel into one box, a move this port cannot make without a portal. `NavigationMenuViewport`
 * therefore paints the shared surface at the open panel's own box, and the panels themselves draw no surface while a viewport is in play.
 *
 * Not carried over, recorded in manifest.yml: `NavigationMenuIndicator` (the animated arrow under the open trigger) and Radix's panel morph animation, which
 * would need measurements of both panels mid-switch; and `navigationMenuTriggerStyle` is a function returning this module's own trigger class rather than the
 * source's `cva` class string, because this library publishes hashed module classes, not utility classes a caller could compose.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MutableRefObject, ReactNode } from 'react'
import css from './NavigationMenu.module.css'

/** How long a pointer has to rest on a trigger before its panel opens, and how long it may be away from bar and panel before that panel closes. */
const OPEN_DELAY_MS = 150
const CLOSE_GRACE_MS = 250

interface NavigationMenuContextValue {
  openId: string | null
  activeId: string | null
  viewportEnabled: boolean
  listRef: MutableRefObject<HTMLUListElement | null>
  setActiveId: (id: string | null) => void
  openNow: (id: string | null) => void
  scheduleOpen: (id: string) => void
  keepOpen: () => void
  scheduleClose: () => void
}

const NavigationMenuContext = createContext<NavigationMenuContextValue | null>(null)

interface ItemContextValue {
  id: string
  isOpen: boolean
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
  setOpen: (open: boolean) => void
  scheduleOpen: () => void
}

const ItemContext = createContext<ItemContextValue | null>(null)

const triggerId = (itemId: string): string => `${itemId}-trigger`

export interface NavigationMenuProps extends HTMLAttributes<HTMLElement> {
  /** Whether the bar renders a shared panel surface under itself. The source defaults to true and so does this port. */
  viewport?: boolean
}

/**
 * A bar of links whose panels share one surface under the whole bar.
 * @param props - the children, whether to render the viewport, and normal attributes; it renders a `<nav>`.
 * @returns the element.
 */
export function NavigationMenu({ viewport = true, children, className, ...rest }: NavigationMenuProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) { window.clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  const openNow = useCallback((id: string | null) => { clearTimers(); setOpenId(id) }, [clearTimers])
  const scheduleOpen = useCallback((id: string) => {
    clearTimers()
    openTimer.current = window.setTimeout(() => { openTimer.current = null; setOpenId(id) }, OPEN_DELAY_MS)
  }, [clearTimers])
  const keepOpen = useCallback(() => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  const scheduleClose = useCallback(() => {
    clearTimers()
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setOpenId(null) }, CLOSE_GRACE_MS)
  }, [clearTimers])

  // The first trigger is the bar's Tab stop until a reader reaches one of the others. Read from the DOM, because triggers register bottom-up.
  useEffect(() => {
    if (activeId !== null) return
    const list = listRef.current
    if (list === null) return
    const first = list.querySelector<HTMLElement>('[data-slot="navigation-menu-trigger"]')
    if (first?.id !== undefined && first.id !== '') setActiveId(first.id)
  }, [activeId, children])

  useEffect(() => {
    if (openId === null) return
    const onPointerDown = (event: globalThis.PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (target instanceof Element && target.closest('[data-slot="navigation-menu-trigger"]') !== null) return
      if (target instanceof Element && target.closest('[data-slot="navigation-menu-content"]') !== null) return
      if (target instanceof Element && target.closest('[data-slot="navigation-menu-list"]') !== null) return
      openNow(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openId, openNow])

  const value = useMemo<NavigationMenuContextValue>(() => ({
    openId, activeId, viewportEnabled: viewport, listRef, setActiveId, openNow, scheduleOpen, keepOpen, scheduleClose,
  }), [openId, activeId, viewport, openNow, scheduleOpen, keepOpen, scheduleClose])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const list = listRef.current
    if (list === null) return
    const ids = [...list.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-trigger"]')].map(node => node.id).filter(id => id !== '')
    if (ids.length === 0) return
    const current = document.activeElement instanceof HTMLElement && ids.includes(document.activeElement.id) ? document.activeElement.id : activeId
    const at = current === null ? -1 : ids.indexOf(current)
    const focusAt = (index: number): void => {
      const next = ids[(index + ids.length) % ids.length]
      if (next === undefined) return
      setActiveId(next)
      document.getElementById(next)?.focus()
      if (openId !== null) setOpenId(next.slice(0, -'-trigger'.length))
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); focusAt(at + 1); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusAt(at - 1); return }
    if (event.key === 'Home') { event.preventDefault(); focusAt(0); return }
    if (event.key === 'End') { event.preventDefault(); focusAt(ids.length - 1); return }
    if (event.key === 'Escape' && openId !== null) {
      event.preventDefault()
      const open = openId
      openNow(null)
      document.getElementById(triggerId(open))?.focus()
    }
  }

  return (
    <NavigationMenuContext.Provider value={value}>
      <nav
        data-slot="navigation-menu"
        data-viewport={viewport ? 'true' : 'false'}
        onKeyDown={onKeyDown}
        onPointerLeave={scheduleClose}
        onPointerEnter={keepOpen}
        className={clsx(css.root, className)}
        {...rest}
      >
        {children}
        {viewport ? <NavigationMenuViewport /> : null}
      </nav>
    </NavigationMenuContext.Provider>
  )
}

/** The `<ul>` the items sit in. Its own element is what the shared panel measures itself against. */
export function NavigationMenuList({ children, className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  const context = useContext(NavigationMenuContext)
  return (
    <ul
      ref={element => { if (context !== null) context.listRef.current = element }}
      data-slot="navigation-menu-list"
      className={clsx(css.list, className)}
      {...rest}
    >
      {children}
    </ul>
  )
}

/** One item: a trigger and the panel it opens. */
export function NavigationMenuItem({ children, className, ...rest }: HTMLAttributes<HTMLLIElement>) {
  const bar = useContext(NavigationMenuContext)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const isOpen = bar?.openId === id
  const value = useMemo<ItemContextValue>(() => ({
    id,
    isOpen,
    triggerRef,
    contentRef,
    setOpen: (open: boolean) => (open ? bar?.openNow(id) : bar?.openNow(null)),
    scheduleOpen: () => bar?.scheduleOpen(id),
  }), [bar, id, isOpen])
  return (
    <ItemContext.Provider value={value}>
      <li data-slot="navigation-menu-item" className={clsx(css.item, className)} {...rest}>{children}</li>
    </ItemContext.Provider>
  )
}

/**
 * The trigger: a button that opens this item's panel. It opens on a hover that rests, immediately when any panel is already open, and on Enter, Space or
 * ArrowDown from the keyboard.
 */
export function NavigationMenuTrigger({ children, className, ...rest }: ButtonAsButtonProps) {
  const bar = useContext(NavigationMenuContext)
  const item = useContext(ItemContext)
  if (item === null) throw new Error('NavigationMenuTrigger must be used within a NavigationMenuItem')
  const isOpen = item.isOpen
  return (
    <button
      type="button"
      ref={element => { item.triggerRef.current = element }}
      id={triggerId(item.id)}
      data-slot="navigation-menu-trigger"
      aria-expanded={isOpen}
      aria-controls={`${item.id}-content`}
      data-state={isOpen ? 'open' : 'closed'}
      tabIndex={bar?.activeId === triggerId(item.id) ? 0 : -1}
      className={clsx(css.trigger, className)}
      onFocus={() => bar?.setActiveId(triggerId(item.id))}
      onPointerEnter={() => {
        if (isOpen) return
        if ((bar?.openId ?? null) === null) item.scheduleOpen()
        else bar?.openNow(item.id)
      }}
      onClick={() => item.setOpen(!isOpen)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.setOpen(true) }
        else if (event.key === 'Escape') { event.preventDefault(); item.setOpen(false) }
      }}
      {...rest}
    >
      {children}
      <svg className={css.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}

export interface NavigationMenuContentProps {
  children?: ReactNode
  className?: string
}

/**
 * This item's panel. Every item's panel is placed at the same coordinates, under the whole list, so switching items does not move it.
 * @param props - the panel's content and a class name.
 * @returns the element, or nothing while the item is closed.
 */
export function NavigationMenuContent({ children, className }: NavigationMenuContentProps) {
  const bar = useContext(NavigationMenuContext)
  const item = useContext(ItemContext)
  const isOpen = item?.isOpen ?? false
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [positioned, setPositioned] = useState(false)
  const shared = bar?.viewportEnabled ?? false

  useEffect(() => {
    if (!isOpen) { setPositioned(false); return }
    const measure = (): void => {
      const list = bar?.listRef.current
      const panel = item?.contentRef.current
      if (list === null || list === undefined || panel === null || panel === undefined) return
      const rect = list.getBoundingClientRect()
      const width = panel.offsetWidth
      const left = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - width - 8))
      const below = rect.bottom + 8
      const top = below + panel.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - 8 - panel.offsetHeight) : below
      setStyle({ left, top })
      setPositioned(true)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [isOpen, bar, item])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || item == null) return
      item.setOpen(false)
      item.triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, item])

  if (!isOpen) return null
  return (
    <div
      ref={element => { if (item != null) item.contentRef.current = element }}
      id={item == null ? undefined : `${item.id}-content`}
      data-slot="navigation-menu-content"
      data-state={positioned ? 'open' : 'pending'}
      data-shared-surface={shared ? 'true' : 'false'}
      className={clsx(css.content, className)}
      style={style}
      onPointerEnter={() => bar?.keepOpen()}
      onPointerLeave={() => bar?.scheduleClose()}
    >
      {children}
    </div>
  )
}

/**
 * The shared surface under the bar, drawn at the open panel's own box. It paints the panel's background and border so that the panel itself can stay
 * transparent and every item's panel can sit at the same coordinates.
 * @returns the element, or nothing while every item is closed.
 */
export function NavigationMenuViewport({ className }: { className?: string }) {
  const bar = useContext(NavigationMenuContext)
  const isOpen = (bar?.openId ?? null) !== null
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [positioned, setPositioned] = useState(false)

  useEffect(() => {
    if (!isOpen) { setPositioned(false); return }
    const observer = new ResizeObserver(() => { measure() })
    let observed: HTMLElement | null = null
    function measure(): void {
      const panel = document.querySelector<HTMLElement>('[data-slot="navigation-menu-content"][data-state="open"]')
      if (panel === null) return
      if (panel !== observed) { observer.disconnect(); observed = panel; observer.observe(panel) }
      const rect = panel.getBoundingClientRect()
      setStyle({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      setPositioned(true)
    }
    // The panel only becomes queryable one commit after this effect runs - it publishes data-state=open as its own measurement lands - so the first
    // measure waits a frame instead of being taken now, and a resize observer keeps the surface with it afterwards.
    const frame = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isOpen, bar])

  if (!isOpen) return null
  return (
    <div
      data-slot="navigation-menu-viewport"
      data-state={positioned ? 'open' : 'closed'}
      aria-hidden="true"
      className={clsx(css.viewport, className)}
      style={style}
    />
  )
}

/** A link. `active` marks the current page, which is what `aria-current` reports. */
export function NavigationMenuLink({ active = false, className, children, ...rest }: AnchorAsAnchorProps & { active?: boolean }) {
  return (
    <a
      data-slot="navigation-menu-link"
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
      className={clsx(css.link, className)}
      {...rest}
    >
      {children}
    </a>
  )
}

/**
 * The source's `cva` class string, as a function returning this module's own trigger class. A caller composing utility classes has no equivalent here - this
 * library publishes hashed module classes, so the function exists to keep the source's call shape, not to be composed.
 * @returns the class name that makes a link look like a trigger.
 */
export function navigationMenuTriggerStyle(): string {
  return css.trigger ?? ''
}

type ButtonAsButtonProps = { children?: ReactNode, className?: string } & Omit<HTMLAttributes<HTMLButtonElement>, 'id'>
type AnchorAsAnchorProps = { children?: ReactNode, className?: string } & Omit<HTMLAttributes<HTMLAnchorElement>, 'aria-current'>