/**
 * Ported from shadcn/ui's Sidebar (https://ui.shadcn.com/docs/components/sidebar, MIT licence, registry item `sidebar`, style new-york-v4, fetched
 * 2026-09-22). Radix, `class-variance-authority` and lucide are dropped and the parts written by hand, because a client bundle here may require only react,
 * react/jsx-runtime and the app primitives (the built-bundle test enforces it).
 *
 * What shipped is the whole desktop rail: `SidebarProvider` owning the open state with the `Mod+B` shortcut and the width variables, `useSidebar`, the rail
 * itself with its `side`/`variant`/`collapsible` attributes, the trigger and the click-anywhere rail, the inset, the header/footer/content/separator, the
 * group parts, the menu parts down to the submenu, and the action and badge affordances.
 *
 * DELIBERATE PARTIALS, all recorded in manifest.yml. The mobile sidebar is not ported: upstream renders the rail inside a Sheet on a small screen, and a
 * Sheet exists here as its own item that this one may not import (self-containment is what the ingest gate enforces) - so `isMobile` is false and the rail
 * stays the desktop rail. The `sidebar_state` cookie is not written, so `open` is not remembered between sessions; a caller owns the state through
 * `open`/`onOpenChange` and can persist it. The collapsed-state tooltips are not ported (they need the Tooltip item). `SidebarInput` and
 * `SidebarMenuSkeleton` are not ported, the latter because a skeleton is the Skeleton item restated; and `SidebarMenuButton`'s `asChild` is not ported, so a
 * caller who wants a link uses its own anchor inside the row rather than the row becoming one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import css from './Sidebar.module.css'

export type SidebarSide = 'left' | 'right'
export type SidebarVariant = 'sidebar' | 'floating' | 'inset'
export type SidebarCollapsible = 'offcanvas' | 'icon' | 'none'
export type SidebarState = 'expanded' | 'collapsed'

interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  state: SidebarState
  /** Always false in this port: the mobile rail upstream is a Sheet, which is a separate item here. */
  isMobile: boolean
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

/** The rail's own state, its toggle, and the shortcut. */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)
  if (context === null) throw new Error('useSidebar must be used within a SidebarProvider')
  return context
}

export interface SidebarProviderProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether the rail starts open. Defaults to true, as upstream does. */
  defaultOpen?: boolean
  /** The open state, when the caller owns it. */
  open?: boolean
  /** Called when the state should change - from the trigger, the rail or the shortcut. */
  onOpenChange?: (open: boolean) => void
}

/**
 * Own the rail's state and the `Mod+B` shortcut.
 * @param props - the open state, and normal attributes for the wrapper.
 * @returns the wrapper element, with the width variables this module reads.
 */
export function SidebarProvider({ defaultOpen = true, open: controlledOpen, onOpenChange, children, className, style, ...rest }: SidebarProviderProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlledOpen === undefined ? uncontrolled : controlledOpen

  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }, [controlledOpen, onOpenChange])
  const toggle = useCallback(() => setOpen(!open), [open, setOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'b' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen(!open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  const value = useMemo<SidebarContextValue>(() => ({ open, setOpen, toggle, state: open ? 'expanded' : 'collapsed', isMobile: false }), [open, setOpen, toggle])

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        data-state={open ? 'expanded' : 'collapsed'}
        className={clsx(css.wrapper, className)}
        style={style}
        {...rest}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
  /** Which edge the rail sits on. */
  side?: SidebarSide
  /** `sidebar` is flush, `floating` lifts the rail off the edge, `inset` lifts the content instead. */
  variant?: SidebarVariant
  /** What collapsing does: slide it away, narrow it to icons, or nothing. */
  collapsible?: SidebarCollapsible
}

/**
 * The rail.
 * @param props - the side, the variant, the collapse mode, and normal attributes.
 * @returns the element, carrying `data-state`, `data-side`, `data-variant` and `data-collapsible` for styling.
 */
export function Sidebar({ side = 'left', variant = 'sidebar', collapsible = 'offcanvas', children, className, ...rest }: SidebarProps) {
  const { state } = useSidebar()
  if (collapsible === 'none') {
    return <div data-slot="sidebar" data-state={state} data-side={side} data-variant={variant} className={clsx(css.railPlain, className)} {...rest}>{children}</div>
  }
  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-side={side}
      data-variant={variant}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      className={clsx(css.rail, className)}
      {...rest}
    >
      <div data-slot="sidebar-inner" className={css.inner}>{children}</div>
    </div>
  )
}

/** A button that toggles the rail, for a header or a toolbar. */
export function SidebarTrigger({ className, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggle } = useSidebar()
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-label="Toggle the sidebar"
      className={clsx(css.trigger, className)}
      onClick={event => { onClick?.(event); toggle() }}
      {...rest}
    >
      <svg className={css.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
      </svg>
    </button>
  )
}

/** The thin strip on the rail's edge: pressing it toggles too, which is how a reader grabs a collapsed rail. */
export function SidebarRail({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const { toggle } = useSidebar()
  return (
    <div
      data-slot="sidebar-rail"
      aria-hidden="true"
      onClick={toggle}
      className={clsx(css.railHandle, className)}
      {...rest}
    />
  )
}

/** The content beside the rail. It takes the rest of the width and offers the trigger on a small screen where the rail is not shown. */
export function SidebarInset({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return <main data-slot="sidebar-inset" className={clsx(css.inset, className)} {...rest}>{children}</main>
}

/** The top of the rail. */
export function SidebarHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-header" className={clsx(css.header, className)} {...rest} />
}

/** The bottom of the rail. */
export function SidebarFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-footer" className={clsx(css.footer, className)} {...rest} />
}

/** The scrolling middle of the rail. */
export function SidebarContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-content" className={clsx(css.content, className)} {...rest} />
}

/** A rule across the rail. */
export function SidebarSeparator({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-separator" role="separator" className={clsx(css.separator, className)} {...rest} />
}

/** A named block of rows. */
export function SidebarGroup({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group" className={clsx(css.group, className)} {...rest} />
}

/** The group's heading. It is hidden while the rail is collapsed to icons. */
export function SidebarGroupLabel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group-label" className={clsx(css.groupLabel, className)} {...rest} />
}

/** A small button on the group's heading, for a group-level action. */
export function SidebarGroupAction({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" data-slot="sidebar-group-action" className={clsx(css.groupAction, className)} {...rest} />
}

/** The group's rows. */
export function SidebarGroupContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group-content" className={clsx(css.groupContent, className)} {...rest} />
}

/** A list of rows. */
export function SidebarMenu({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul data-slot="sidebar-menu" role="list" className={clsx(css.menu, className)} {...rest} />
}

/** One row's wrapper. */
export function SidebarMenuItem({ className, ...rest }: HTMLAttributes<HTMLLIElement>) {
  return <li data-slot="sidebar-menu-item" className={clsx(css.menuItem, className)} {...rest} />
}

export interface SidebarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether this row is the one being shown. It reports `aria-current="page"` and styles itself as chosen. */
  isActive?: boolean
}

/**
 * The row's button: an icon and a label, in that order. While the rail is collapsed to icons the LAST span inside the row is hidden, which is the same
 * convention upstream's own markup relies on, so put the icon first and the label last.
 */
export function SidebarMenuButton({ isActive = false, className, children, ...rest }: SidebarMenuButtonProps) {
  const { state } = useSidebar()
  return (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-active={isActive ? 'true' : 'false'}
      data-state={state}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(css.menuButton, className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A small button at the row's trailing edge, for an action that is not the row's own. */
export function SidebarMenuAction({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" data-slot="sidebar-menu-action" className={clsx(css.menuAction, className)} {...rest} />
}

/** A count or a state at the row's trailing edge. */
export function SidebarMenuBadge({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-menu-badge" className={clsx(css.menuBadge, className)} {...rest} />
}

/** A nested list of rows, indented under its parent. */
export function SidebarMenuSub({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul data-slot="sidebar-menu-sub" role="list" className={clsx(css.menuSub, className)} {...rest} />
}

/** A wrapper for one nested row. */
export function SidebarMenuSubItem({ className, ...rest }: HTMLAttributes<HTMLLIElement>) {
  return <li data-slot="sidebar-menu-sub-item" className={clsx(css.menuSubItem, className)} {...rest} />
}

/**
 * A nested row's link. It is an anchor, because a nested row is nearly always a destination.
 */
export function SidebarMenuSubButton({ isActive = false, className, children, ...rest }: HTMLAttributes<HTMLAnchorElement> & { isActive?: boolean }) {
  return (
    <a
      data-slot="sidebar-menu-sub-button"
      data-active={isActive ? 'true' : 'false'}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(css.menuSubButton, className)}
      {...rest}
    >
      {children}
    </a>
  )
}
