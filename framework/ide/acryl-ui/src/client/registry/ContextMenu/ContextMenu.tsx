/**
 * Ported from shadcn/ui's Context Menu (https://ui.shadcn.com/docs/components/context-menu, MIT licence, registry item `context-menu`, style
 * new-york-v4, fetched 2026-09-22). A menu opened by a right-click, anchored at the pointer rather than at a field.
 *
 * Restates the anchored-listbox shape in docs/pattern-anchored-listbox.md for its anchoring and dismissal half (points 1 to 5, 7 and 8) with two
 * differences the source forces: the anchor is the POINTER's coordinates captured from the contextmenu event rather than an element's rect, and there is
 * no query, so the keyboard walks every item instead of a filtered subset. A shared pattern restated, never an importable module.
 *
 * TWO THINGS UPSTREAM HAS THAT THIS PASS DOES NOT, deliberate and recorded in manifest.yml:
 *
 * 1. The submenu family (ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent) is a documented follow-up. A submenu is a nested anchored panel
 *    with hover-intent, which is a different problem from the base menu.
 * 2. ContextMenuPortal does not exist, for the same reason Sheet and Popover have no portal - a client bundle may require only react, react/jsx-runtime
 *    and the app primitives, and react-dom's createPortal is outside that set - so the panel renders where it sits and an ancestor with overflow hidden
 *    or a transform can clip it.
 *
 * Radix's `asChild`/Slot is not ported, so the trigger is a wrapper element carrying `tabIndex={0}`: it has to be focusable for focus to be restored to
 * it on close, and for a keyboard user to reach it at all. Radix's enter/exit animations and its collision-aware positioning have no equivalent here -
 * this port clamps the panel to the viewport instead of tracking Radix's collision algorithm. lucide-react's CheckIcon became a plain inline SVG. See
 * manifest.yml.
 */
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { MutableRefObject, ReactNode } from 'react'
import css from './ContextMenu.module.css'

interface ContextMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  point: { x: number, y: number }
  contentRef: MutableRefObject<HTMLDivElement | null>
  triggerRef: MutableRefObject<HTMLElement | null>
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

export interface ContextMenuProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

/** Own the menu's open state and the pointer position it was opened at. */
export function ContextMenu({ open: controlledOpen, defaultOpen = false, onOpenChange, children }: ContextMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const contentRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const open = controlledOpen ?? uncontrolledOpen
  const value = useMemo<ContextMenuContextValue>(() => ({
    open,
    point,
    setOpen: next => { if (controlledOpen === undefined) setUncontrolledOpen(next); onOpenChange?.(next) },
    contentRef,
    triggerRef,
  }), [open, point, controlledOpen, onOpenChange])
  return (
    <ContextMenuContext.Provider value={value}>
      <ContextMenuPoint.Provider value={setPoint}>{children}</ContextMenuPoint.Provider>
    </ContextMenuContext.Provider>
  )
}

/** The pointer position is set by the trigger and read by the content, so it travels beside the open state. */
const ContextMenuPoint = createContext<(point: { x: number, y: number }) => void>(() => {})

/** The region that opens the menu on a right-click. Focusable, so focus can be returned to it on close. */
export function ContextMenuTrigger({ children, className }: { children?: ReactNode, className?: string }) {
  const context = useContext(ContextMenuContext)
  const setPoint = useContext(ContextMenuPoint)
  return (
    <div
      ref={element => { if (context !== null) context.triggerRef.current = element }}
      data-slot="context-menu-trigger"
      tabIndex={0}
      className={clsx(css.trigger, className)}
      onContextMenu={event => {
        event.preventDefault()
        setPoint({ x: event.clientX, y: event.clientY })
        context?.setOpen(true)
      }}
    >
      {children}
    </div>
  )
}

export interface ContextMenuContentProps {
  children?: ReactNode
  className?: string
}

/**
 * The panel, placed at the pointer and clamped to the viewport. Renders nothing until the menu is open.
 * @param props - the menu's content.
 * @returns the element.
 */
export function ContextMenuContent({ children, className }: ContextMenuContentProps) {
  const context = useContext(ContextMenuContext)
  const open = context?.open ?? false
  const [placement, setPlacement] = useState<{ left: number, top: number } | null>(null)

  useEffect(() => {
    if (!open) { setPlacement(null); return }
    const panel = context?.contentRef.current
    if (panel === null || panel === undefined) return
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    const left = Math.min(context?.point.x ?? 0, Math.max(8, window.innerWidth - width - 8))
    const top = Math.min(context?.point.y ?? 0, Math.max(8, window.innerHeight - height - 8))
    setPlacement({ left, top })
    panel.focus()
  }, [open, context])

  useEffect(() => {
    if (!open || context === null) return
    /** The items a keyboard walk moves through, in DOM order. No query here, so nothing is filtered out. */
    const walkable = (): string[] => {
      const root = context.contentRef.current
      if (root === null) return []
      return [...root.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
        .filter(node => node.getAttribute('data-disabled') !== 'true')
        .map(node => node.id)
        .filter(id => id !== '')
    }
    const highlight = (id: string | null): void => {
      const root = context.contentRef.current
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
      const root = context.contentRef.current
      const current = [...(root?.querySelectorAll<HTMLElement>('[data-highlighted="true"]') ?? [])][0]?.id
      const at = current === undefined ? -1 : ids.indexOf(current)
      highlight(ids[at === -1 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length] ?? null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        context.setOpen(false)
        context.triggerRef.current?.focus()
        return
      }
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
      if (event.key === 'Home') { event.preventDefault(); highlight(walkable()[0] ?? null); return }
      if (event.key === 'End') {
        event.preventDefault()
        const ids = walkable()
        highlight(ids[ids.length - 1] ?? null)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const root = context.contentRef.current
        const current = [...(root?.querySelectorAll<HTMLElement>('[data-highlighted="true"]') ?? [])][0]
        if (current === undefined) return
        event.preventDefault()
        current.click()
      }
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
  }, [open, context])

  if (!open) return null
  return (
    <div
      ref={element => { if (context !== null) context.contentRef.current = element }}
      data-slot="context-menu-content"
      role="menu"
      tabIndex={-1}
      className={clsx(css.content, className)}
      style={placement === null ? { visibility: 'hidden' } : { left: placement.left, top: placement.top }}
    >
      {children}
    </div>
  )
}

export interface ContextMenuItemProps {
  inset?: boolean
  variant?: 'default' | 'destructive'
  disabled?: boolean
  onSelect?: () => void
  children?: ReactNode
  className?: string
}

/** One action. `data-inset` indents it for rows that carry an indicator beside them. */
export function ContextMenuItem({ inset = false, variant = 'default', disabled = false, onSelect, children, className }: ContextMenuItemProps) {
  const context = useContext(ContextMenuContext)
  const id = useId()
  return (
    <div
      id={id}
      data-slot="context-menu-item"
      role="menuitem"
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-variant={variant}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; onSelect?.(); context?.setOpen(false) }}
      onPointerMove={() => {
        const root = context?.contentRef.current
        if (root === null || root === undefined) return
        for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
        document.getElementById(id)?.setAttribute('data-highlighted', 'true')
      }}
    >
      {children}
    </div>
  )
}

export interface ContextMenuCheckboxItemProps extends Omit<ContextMenuItemProps, 'variant'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export function ContextMenuCheckboxItem({ checked = false, inset = false, disabled = false, onCheckedChange, children, className }: ContextMenuCheckboxItemProps) {
  const context = useContext(ContextMenuContext)
  const id = useId()
  return (
    <div
      id={id}
      data-slot="context-menu-checkbox-item"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; onCheckedChange?.(!checked); context?.setOpen(false) }}
      onPointerMove={() => {
        const root = context?.contentRef.current
        if (root === null || root === undefined) return
        for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
        document.getElementById(id)?.setAttribute('data-highlighted', 'true')
      }}
    >
      <span data-slot="context-menu-indicator" className={css.indicator}>
        {checked && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>}
      </span>
      {children}
    </div>
  )
}

interface RadioContextValue { value: string | null, setValue: (value: string) => void }
const RadioGroupContext = createContext<RadioContextValue | null>(null)

export function ContextMenuRadioGroup({ value: controlledValue, defaultValue = null, onValueChange, children, className }: { value?: string | null, defaultValue?: string | null, onValueChange?: (value: string) => void, children?: ReactNode, className?: string }) {
  const [uncontrolled, setUncontrolled] = useState<string | null>(defaultValue)
  const value = controlledValue === undefined ? uncontrolled : controlledValue
  const contextValue = useMemo<RadioContextValue>(() => ({
    value,
    setValue: next => { if (controlledValue === undefined) setUncontrolled(next); onValueChange?.(next) },
  }), [value, controlledValue, onValueChange])
  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div data-slot="context-menu-radio-group" role="group" className={className}>{children}</div>
    </RadioGroupContext.Provider>
  )
}

export function ContextMenuRadioItem({ value, inset = false, disabled = false, children, className }: { value: string, inset?: boolean, disabled?: boolean, children?: ReactNode, className?: string }) {
  const context = useContext(ContextMenuContext)
  const radio = useContext(RadioGroupContext)
  const id = useId()
  const checked = radio?.value === value
  return (
    <div
      id={id}
      data-slot="context-menu-radio-item"
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-inset={inset}
      data-highlighted="false"
      className={clsx(css.item, className)}
      onClick={() => { if (disabled) return; radio?.setValue(value); context?.setOpen(false) }}
      onPointerMove={() => {
        const root = context?.contentRef.current
        if (root === null || root === undefined) return
        for (const node of root.querySelectorAll<HTMLElement>('[data-highlighted="true"]')) node.setAttribute('data-highlighted', 'false')
        document.getElementById(id)?.setAttribute('data-highlighted', 'true')
      }}
    >
      <span data-slot="context-menu-indicator" className={css.indicator}>
        {checked && <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><circle cx="4" cy="4" r="3" fill="currentColor" /></svg>}
      </span>
      {children}
    </div>
  )
}

export function ContextMenuLabel({ inset = false, children, className }: { inset?: boolean, children?: ReactNode, className?: string }) {
  return <div data-slot="context-menu-label" data-inset={inset} className={clsx(css.label, className)}>{children}</div>
}

export function ContextMenuSeparator({ className }: { className?: string }) {
  return <div data-slot="context-menu-separator" role="separator" className={clsx(css.separator, className)} />
}

export function ContextMenuShortcut({ children, className }: { children?: ReactNode, className?: string }) {
  return <span data-slot="context-menu-shortcut" className={clsx(css.shortcut, className)}>{children}</span>
}

export function ContextMenuGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="context-menu-group" role="group" className={className}>{children}</div>
}