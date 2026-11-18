/**
 * Ported from shadcn/ui's Menubar (https://ui.shadcn.com/docs/components/menubar, MIT licence, registry item `menubar`, style new-york-v4, fetched
 * 2026-09-22). Radix's Menubar is dropped and its behaviour written by hand, because a client bundle here may require only react, react/jsx-runtime and the
 * app primitives (the built-bundle test enforces it).
 *
 * Restates the anchored-listbox shape from docs/pattern-anchored-listbox.md: the panel is measured against its own trigger's rect in viewport coordinates
 * with viewport clamping and re-measure on resize and scroll, renders where it sits in the tree instead of through a portal, and takes focus only once it has
 * been positioned; Escape and an outside pointerdown dismiss it; the keyboard walks the items in DOM order read at key time rather than tracked in state.
 * A pattern each item restates, never an importable module - a cross-item import is what this registry's ingest gate rejects.
 *
 * Two things the bar adds to that shape, and they are the whole difference from a plain menu. (1) Roving focus: the bar is one Tab stop, not one per
 * trigger, so only the active trigger is tabbable and the arrow keys walk the bar - moving on to open the next menu when one is already open, which is how
 * a menu bar behaves. (2) Hover intent: once any menu is open, moving the pointer onto a sibling trigger switches to it, so a reader can slide along the
 * bar without clicking.
 *
 * Not carried over, recorded in manifest.yml: the submenu family (MenubarSub, MenubarSubTrigger, MenubarSubContent), which is the same deliberate partial
 * ContextMenu took, since a submenu is a nested anchored panel with its own hover-intent problem; MenubarPortal, for the same reason Sheet and Popover have
 * none - react-dom's createPortal is outside the set a client bundle may require, so an ancestor with `overflow: hidden` or a transform can clip a panel;
 * and Radix's collision-aware positioning, which this port replaces with viewport clamping. lucide's CheckIcon and CircleIcon became plain inline SVGs.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent, MutableRefObject, ReactNode } from 'react'
import css from './Menubar.module.css'

interface MenuContextValue {
  id: string
  isOpen: boolean
  setOpen: (open: boolean) => void
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
}

interface BarContextValue {
  openId: string | null
  setOpenId: (id: string | null) => void
  activeId: string | null
  setActiveId: (id: string | null) => void
  barRef: MutableRefObject<HTMLDivElement | null>
}

const BarContext = createContext<BarContextValue | null>(null)
const MenuContext = createContext<MenuContextValue | null>(null)

export interface MenubarProps {
  children?: ReactNode
  className?: string
  /** Called when the open menu changes, with the id of the menu that opened, or `null` when the bar closes. */
  onValueChange?: (menuId: string | null) => void
}

/** Trigger ids are derived from the menu id, so the bar can walk its triggers and know which menu each one belongs to. */
const triggerId = (menuId: string): string => `${menuId}-trigger`

/**
 * A horizontal bar of menus. It is one Tab stop: the arrow keys walk its triggers, and they open the menu they land on when one is already open.
 * @param props - the children, a class name, and an optional open-menu callback.
 * @returns the element, with `role="menubar"`.
 */
export function Menubar({ children, className, onValueChange }: MenubarProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  // The first trigger is the bar's Tab stop until a reader reaches one of the others. Read from the DOM, because the triggers register bottom-up.
  useEffect(() => {
    if (activeId !== null) return
    const bar = barRef.current
    if (bar === null) return
    const first = bar.querySelector<HTMLElement>('[data-slot="menubar-trigger"]')
    if (first?.id !== undefined && first.id !== '') setActiveId(first.id)
  }, [activeId, children])

  const setOpen = useCallback((id: string | null) => {
    setOpenId(id)
    onValueChange?.(id)
  }, [onValueChange])

  const value = useMemo<BarContextValue>(() => ({ openId, setOpenId: setOpen, activeId, setActiveId, barRef }),
    [openId, setOpen, activeId])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const bar = barRef.current
    if (bar === null) return
    const ids = [...bar.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]')].map(node => node.id).filter(id => id !== '')
    if (ids.length === 0) return
    const current = document.activeElement instanceof HTMLElement && ids.includes(document.activeElement.id) ? document.activeElement.id : activeId
    const at = current === null ? -1 : ids.indexOf(current)
    const focusAt = (index: number): void => {
      const next = ids[(index + ids.length) % ids.length]
      if (next === undefined) return
      setActiveId(next)
      document.getElementById(next)?.focus()
      // With a menu already open, walking the bar opens the one it lands on - a menu bar's own behaviour, and the reason this handler is on the bar.
      if (openId !== null) setOpen(next.slice(0, -'-trigger'.length))
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); focusAt(at + 1); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusAt(at - 1); return }
    if (event.key === 'Home') { event.preventDefault(); focusAt(0); return }
    if (event.key === 'End') { event.preventDefault(); focusAt(ids.length - 1); return }
    if (event.key === 'Escape' && openId !== null) {
      event.preventDefault()
      const open = openId
      setOpen(null)
      document.getElementById(triggerId(open))?.focus()
    }
  }

  return (
    <BarContext.Provider value={value}>
      <div
        ref={barRef}
        data-slot="menubar"
        role="menubar"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null) }}
        className={clsx(css.menubar, className)}
      >
        {children}
      </div>
    </BarContext.Provider>
  )
}

/**
 * One menu in the bar: its trigger and its panel. It renders no element of its own; what it does is pair the two and hold their open state.
 * @param props - the trigger and the panel.
 * @returns the children, inside this menu's context.
 */
export function MenubarMenu({ children }: { children?: ReactNode }) {
  const bar = useContext(BarContext)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const isOpen = bar?.openId === id
  const value = useMemo<MenuContextValue>(() => ({
    id,
    isOpen,
    setOpen: (open: boolean) => bar?.setOpenId(open ? id : null),
    triggerRef,
    contentRef,
  }), [bar, id, isOpen])
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

/**
 * The bar's visible button. Enter, Space and ArrowDown open its menu; the arrow keys across the bar are the bar's own.
 * @param props - the label and normal `<button>` attributes.
 * @returns the element.
 */
export function MenubarTrigger({ children, className, ...rest }: { children?: ReactNode, className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'id'>) {
  const bar = useContext(BarContext)
  const menu = useContext(MenuContext)
  const isOpen = menu?.isOpen ?? false
  const isActive = bar?.activeId === (menu === null ? null : triggerId(menu.id))
  return (
    <button
      type="button"
      ref={element => { if (menu !== null) menu.triggerRef.current = element }}
      id={menu === null ? undefined : triggerId(menu.id)}
      data-slot="menubar-trigger"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={menu === null ? undefined : `${menu.id}-content`}
      data-state={isOpen ? 'open' : 'closed'}
      tabIndex={isActive ? 0 : -1}
      className={clsx(css.trigger, className)}
      onFocus={() => bar?.setActiveId(menu === null ? null : triggerId(menu.id))}
      onClick={() => menu?.setOpen(!isOpen)}
      onPointerEnter={() => { if ((bar?.openId ?? null) !== null && !isOpen) menu?.setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          menu?.setOpen(true)
          return
        }
        if (event.key === 'Escape') { event.preventDefault(); menu?.setOpen(false) }
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface MenubarContentProps {
  align?: 'start' | 'center' | 'end'
  alignOffset?: number
  sideOffset?: number
  children?: ReactNode
  className?: string
}

/**
 * The panel that hangs under this menu's trigger. It renders nothing until the menu is open.
 * @param props - the alignment, the offsets, and the panel's content.
 * @returns the element, or nothing.
 */
export function MenubarContent({ align = 'start', alignOffset = -4, sideOffset = 8, children, className }: MenubarContentProps) {
  const menu = useContext(MenuContext)
  const isOpen = menu?.isOpen ?? false
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [positioned, setPositioned] = useState(false)

  useEffect(() => {
    if (!isOpen) { setPositioned(false); return }
    const measure = (): void => {
      const trigger = menu?.triggerRef.current
      const panel = menu?.contentRef.current
      if (trigger === null || trigger === undefined || panel === null || panel === undefined) return
      const rect = trigger.getBoundingClientRect()
      const width = panel.offsetWidth
      const ideal = align === 'start' ? rect.left : align === 'end' ? rect.right - width : rect.left + rect.width / 2 - width / 2
      const left = Math.min(Math.max(ideal + alignOffset, 8), Math.max(8, window.innerWidth - width - 8))
      const below = rect.bottom + sideOffset
      const top = below + panel.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - sideOffset - panel.offsetHeight) : below
      setStyle({ left, top })
      setPositioned(true)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [isOpen, menu, align, alignOffset, sideOffset])

  // Focus waits for the positioning pass: the panel starts hidden, and a focus() in the same commit as the first measure lands on a hidden element and does
  // nothing. Popover's port learned this the same way.
  useEffect(() => {
    if (positioned) menu?.contentRef.current?.focus()
  }, [positioned, menu])

  useEffect(() => {
    if (!isOpen || menu === null) return
    const close = (): void => { menu.setOpen(false); menu.triggerRef.current?.focus() }
    /** The items a keyboard walk moves through, in DOM order. */
    const walkable = (): string[] => {
      const root = menu.contentRef.current
      if (root === null) return []
      return [...root.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
        .filter(node => node.getAttribute('data-disabled') !== 'true')
        .map(node => node.id)
        .filter(id => id !== '')
    }
    const highlight = (id: string | null): void => {
      const root = menu.contentRef.current
      if (root === null) return
      for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
      if (id === null) return
      const next = document.getElementById(id)
      next?.setAttribute('data-highlighted', 'true')
      next?.scrollIntoView({ block: 'nearest' })
    }
    const move = (delta: number): void => {
      const ids = walkable()
      if (ids.length === 0) return
      const root = menu.contentRef.current
      const current = [...(root?.querySelectorAll<HTMLElement>('[data-highlighted="true"]') ?? [])][0]?.id
      const at = current === undefined ? -1 : ids.indexOf(current)
      highlight(ids[at === -1 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length] ?? null)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') { close(); return }
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
      if (event.key === 'Home') { event.preventDefault(); highlight(walkable()[0] ?? null); return }
      if (event.key === 'End') { event.preventDefault(); const ids = walkable(); highlight(ids[ids.length - 1] ?? null); return }
      if (event.key === 'Enter' || event.key === ' ') {
        const root = menu.contentRef.current
        const current = [...(root?.querySelectorAll<HTMLElement>('[data-highlighted="true"]') ?? [])][0]
        if (current === undefined) return
        event.preventDefault()
        current.click()
      }
    }
    const onPointerDown = (event: globalThis.PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      // A press on any trigger in the bar is the bar's own business: it either toggles that menu or switches to it.
      if (target instanceof Element && target.closest('[data-slot="menubar-trigger"]') !== null) return
      if (menu.contentRef.current?.contains(target) === true) return
      menu.setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown) }
  }, [isOpen, menu])

  if (!isOpen) return null
  return (
    <div
      ref={element => { if (menu !== null) menu.contentRef.current = element }}
      id={menu === null ? undefined : `${menu.id}-content`}
      data-slot="menubar-content"
      role="menu"
      tabIndex={-1}
      aria-labelledby={menu === null ? undefined : triggerId(menu.id)}
      className={clsx(css.content, className)}
      style={style}
    >
      {children}
    </div>
  )
}

export interface MenubarItemProps {
  inset?: boolean
  variant?: 'default' | 'destructive'
  disabled?: boolean
  onSelect?: () => void
  children?: ReactNode
  className?: string
}

/** One action. `data-inset` indents it for rows that carry an indicator beside them. */
export function MenubarItem({ inset = false, variant = 'default', disabled = false, onSelect, children, className }: MenubarItemProps) {
  const menu = useContext(MenuContext)
  const id = useId()
  const highlight = (): void => {
    const root = menu?.contentRef.current
    if (root === null || root === undefined) return
    for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
    document.getElementById(id)?.setAttribute('data-highlighted', 'true')
  }
  return (
    <div
      id={id}
      data-slot="menubar-item"
      role="menuitem"
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-variant={variant}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; onSelect?.(); menu?.setOpen(false) }}
      onPointerMove={highlight}
    >
      {children}
    </div>
  )
}

export interface MenubarCheckboxItemProps extends Omit<MenubarItemProps, 'variant'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** A row that holds its own state: it stays open when it is used, which is what a checkbox row is for. */
export function MenubarCheckboxItem({ checked = false, inset = false, disabled = false, onCheckedChange, children, className }: MenubarCheckboxItemProps) {
  const menu = useContext(MenuContext)
  const id = useId()
  return (
    <div
      id={id}
      data-slot="menubar-checkbox-item"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; onCheckedChange?.(!checked) }}
      onPointerMove={() => {
        const root = menu?.contentRef.current
        if (root === null || root === undefined) return
        for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
        document.getElementById(id)?.setAttribute('data-highlighted', 'true')
      }}
    >
      <span data-slot="menubar-indicator" className={css.indicator}>
        {checked ? <CheckIcon /> : null}
      </span>
      {children}
    </div>
  )
}

interface RadioContextValue { value: string | null, setValue: (value: string) => void }
const RadioGroupContext = createContext<RadioContextValue | null>(null)

/** A set of rows where only one is chosen. */
export function MenubarRadioGroup({ value: controlledValue, defaultValue = null, onValueChange, children, className }: { value?: string | null, defaultValue?: string | null, onValueChange?: (value: string) => void, children?: ReactNode, className?: string }) {
  const [uncontrolled, setUncontrolled] = useState<string | null>(defaultValue)
  const value = controlledValue === undefined ? uncontrolled : controlledValue
  const radio = useMemo<RadioContextValue>(() => ({
    value,
    setValue: next => { if (controlledValue === undefined) setUncontrolled(next); onValueChange?.(next) },
  }), [value, controlledValue, onValueChange])
  return (
    <RadioGroupContext.Provider value={radio}>
      <div data-slot="menubar-radio-group" role="group" className={className}>{children}</div>
    </RadioGroupContext.Provider>
  )
}

/** One choice inside a radio group. */
export function MenubarRadioItem({ value, inset = false, disabled = false, children, className }: { value: string, inset?: boolean, disabled?: boolean, children?: ReactNode, className?: string }) {
  const menu = useContext(MenuContext)
  const radio = useContext(RadioGroupContext)
  const id = useId()
  const checked = radio?.value === value
  return (
    <div
      id={id}
      data-slot="menubar-radio-item"
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; radio?.setValue(value) }}
      onPointerMove={() => {
        const root = menu?.contentRef.current
        if (root === null || root === undefined) return
        for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
        document.getElementById(id)?.setAttribute('data-highlighted', 'true')
      }}
    >
      <span data-slot="menubar-indicator" className={css.indicator}>
        {checked ? <CircleIcon /> : null}
      </span>
      {children}
    </div>
  )
}

/** A heading inside a panel. */
export function MenubarLabel({ inset = false, children, className }: { inset?: boolean, children?: ReactNode, className?: string }) {
  return <div data-slot="menubar-label" data-inset={inset} className={clsx(css.label, className)}>{children}</div>
}

/** A rule between groups of rows. */
export function MenubarSeparator({ className }: { className?: string }) {
  return <div data-slot="menubar-separator" role="separator" className={clsx(css.separator, className)} />
}

/** The keyboard hint beside a row. */
export function MenubarShortcut({ children, className }: { children?: ReactNode, className?: string }) {
  return <span data-slot="menubar-shortcut" className={clsx(css.shortcut, className)}>{children}</span>
}

/** A named group of rows inside a panel. */
export function MenubarGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="menubar-group" role="group" className={clsx(css.group, className)}>{children}</div>
}

function CheckIcon() {
  return <svg className={css.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" /></svg>
}

function CircleIcon() {
  return <svg className={css.icon} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3" /></svg>
}