/**
 * Ported from shadcn/ui's Command (https://ui.shadcn.com/docs/components/command, MIT licence, registry item `command`, style new-york-v4, fetched
 * 2026-09-22). The searchable command menu: an input, a filtered list, groups with headings, an empty state and keyboard selection.
 *
 * Restates the anchored-listbox shape written down in docs/pattern-anchored-listbox.md (points 6, 7 and 8) — a shared pattern each item restates,
 * never an importable module, because a cross-item import is what this registry's ingest gate rejects.
 *
 * cmdk is dropped and its behaviour written by hand. The root owns the query and a registry of the items mounted under it (each item's filter text,
 * its disabled flag and its select handler); matching is a case-insensitive substring, falling back to "every word of the query is present", which is a
 * substitution for cmdk's fuzzy scorer and is recorded in manifest.yml. Items apply their own visibility from the query, so a filtered-out item is
 * display-none rather than merely faded, and the keyboard walks the surviving items in DOM order - read from the DOM at key time rather than tracked in
 * state, because React registers children bottom-up and would otherwise reverse the order. Arrow keys, Home/End and Enter move and choose; the chosen
 * item scrolls into view with `block: nearest`, as cmdk does.
 *
 * `CommandDialog` is NOT ported: it composes shadcn's own Dialog item, and importing a sibling item's file is the cross-item dependency this registry's
 * ingest gate rejects. A consumer composes this Command inside this library's Dialog (which is itself the app's Modal). lucide-react's SearchIcon became
 * a plain inline SVG, and cmdk's own `[cmdk-*]` attribute selectors became the data-slot hooks this item already publishes. See manifest.yml.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { InputHTMLAttributes, MutableRefObject, ReactNode } from 'react'
import css from './Command.module.css'

/** Case-insensitive substring, else every word of the query present. A substitution for cmdk's fuzzy scorer. */
function matches(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = text.toLowerCase()
  if (haystack.includes(needle)) return true
  return needle.split(/\s+/u).every(word => haystack.includes(word))
}

interface ItemRecord { text: string, disabled: boolean }

interface CommandContextValue {
  query: string
  setQuery: (query: string) => void
  register: (id: string, record: ItemRecord, onSelect: () => void) => void
  unregister: (id: string) => void
  isVisible: (id: string) => boolean
  visibleCount: number
  registeredCount: number
  activeId: string | null
  setActiveId: (id: string | null) => void
  choose: (id: string) => void
  listId: string
  rootRef: MutableRefObject<HTMLDivElement | null>
}

const CommandContext = createContext<CommandContextValue | null>(null)

export interface CommandProps {
  label?: string
  query?: string
  onQueryChange?: (query: string) => void
  children?: ReactNode
  className?: string
}

/** Own the query and the item registry for everything inside the command menu. */
export function Command({ label, query: controlledQuery, onQueryChange, children, className }: CommandProps) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState('')
  const query = controlledQuery ?? uncontrolledQuery
  const [items, setItems] = useState<Record<string, ItemRecord>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const handlers = useRef(new Map<string, () => void>())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()

  const setQuery = useCallback((next: string) => {
    if (controlledQuery === undefined) setUncontrolledQuery(next)
    onQueryChange?.(next)
  }, [controlledQuery, onQueryChange])

  const register = useCallback((id: string, record: ItemRecord, onSelect: () => void) => {
    handlers.current.set(id, onSelect)
    setItems(current => current[id]?.text === record.text && current[id]?.disabled === record.disabled ? current : { ...current, [id]: record })
  }, [])
  const unregister = useCallback((id: string) => {
    handlers.current.delete(id)
    setItems(current => { if (current[id] === undefined) return current; const next = { ...current }; delete next[id]; return next })
  }, [])

  // An item is visible unless the registry has seen it and it does not match. Registration happens in an effect, so
  // "unknown" has to mean visible: otherwise every row would be hidden on the first paint, and a server render (no
  // effects at all) would show an empty menu.
  const isVisible = useCallback((id: string) => {
    const record = items[id]
    if (record === undefined) return true
    return matches(record.text, query)
  }, [items, query])
  const registeredCount = Object.keys(items).length
  const visibleCount = Object.values(items).filter(record => matches(record.text, query)).length

  // Keep exactly one active item while anything is visible: the current one if it survived the query, otherwise the first.
  useEffect(() => {
    const ids = Object.keys(items).filter(id => matches(items[id]?.text ?? '', query))
    setActiveId(current => current !== null && ids.includes(current) ? current : ids[0] ?? null)
  }, [items, query])

  useEffect(() => {
    if (activeId === null) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const choose = useCallback((id: string) => { handlers.current.get(id)?.() }, [])

  const value = useMemo<CommandContextValue>(() => ({
    query, setQuery, register, unregister, isVisible, visibleCount, registeredCount, activeId, setActiveId, choose, listId, rootRef,
  }), [query, setQuery, register, unregister, isVisible, visibleCount, registeredCount, activeId, choose, listId])

  return (
    <CommandContext.Provider value={value}>
      <div
        ref={rootRef}
        data-slot="command"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={listId}
        className={clsx(css.command, className)}
      >
        {children}
      </div>
    </CommandContext.Provider>
  )
}

export type CommandInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>

/** The search box. Arrow keys, Home/End and Enter drive the list without leaving it. */
export function CommandInput({ className, onKeyDown, ...rest }: CommandInputProps) {
  const context = useContext(CommandContext)
  const move = (delta: number): void => {
    const ids = walkableIdsFrom(context)
    if (ids.length === 0) return
    const at = context?.activeId === null || context?.activeId === undefined ? -1 : ids.indexOf(context.activeId)
    const next = at === -1 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length
    context?.setActiveId(ids[next] ?? null)
  }
  return (
    <div data-slot="command-input-wrapper" className={css.wrapper}>
      <svg className={css.search} viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      <input
        data-slot="command-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={context?.listId}
        aria-activedescendant={context?.activeId ?? undefined}
        aria-autocomplete="list"
        autoComplete="off"
        className={clsx(css.input, className)}
        value={context?.query ?? ''}
        onChange={event => { context?.setQuery(event.target.value) }}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          const active = context?.activeId ?? null
          if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
          if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
          if (event.key === 'Home') { event.preventDefault(); context?.setActiveId(walkableIdsFrom(context)[0] ?? null); return }
          if (event.key === 'End') {
            event.preventDefault()
            const ids = walkableIdsFrom(context)
            context?.setActiveId(ids[ids.length - 1] ?? null)
            return
          }
          if (event.key === 'Enter' && active !== null) { event.preventDefault(); context?.choose(active) }
        }}
        {...rest}
      />
    </div>
  )
}

/** DOM order of the walkable items, read at key time so it cannot drift from what is on screen. */
function walkableIdsFrom(context: CommandContextValue | null): string[] {
  const root = context?.rootRef.current
  if (root === null || root === undefined) return []
  return [...root.querySelectorAll<HTMLElement>('[data-slot="command-item"]')]
    .filter(node => node.getAttribute('data-hidden') !== 'true' && node.getAttribute('data-disabled') !== 'true')
    .map(node => node.id)
    .filter(id => id !== '')
}

export function CommandList({ children, className }: { children?: ReactNode, className?: string }) {
  const context = useContext(CommandContext)
  return <div data-slot="command-list" role="listbox" id={context?.listId} aria-label={context?.query ?? undefined} className={clsx(css.list, className)}>{children}</div>
}

/** Renders only once items have registered and none of them match. */
export function CommandEmpty({ children, className }: { children?: ReactNode, className?: string }) {
  const context = useContext(CommandContext)
  if (context !== null && (context.registeredCount === 0 || context.visibleCount > 0)) return null
  return <div data-slot="command-empty" className={clsx(css.empty, className)}>{children}</div>
}

export function CommandGroup({ heading, children, className }: { heading?: string, children?: ReactNode, className?: string }) {
  return (
    <div data-slot="command-group" role="group" className={clsx(css.group, className)}>
      {heading !== undefined && <div data-slot="command-group-heading" className={css.heading}>{heading}</div>}
      {children}
    </div>
  )
}

export function CommandSeparator({ className }: { className?: string }) {
  return <div data-slot="command-separator" role="separator" className={clsx(css.separator, className)} />
}

export interface CommandItemProps {
  /** The text this item is matched against. Defaults to the item's own text content. */
  value?: string
  disabled?: boolean
  onSelect?: () => void
  children?: ReactNode
  className?: string
}

/** One selectable row. Filtered-out items are display-none, so they leave both the layout and the keyboard walk. */
export function CommandItem({ value, disabled = false, onSelect, children, className }: CommandItemProps) {
  const context = useContext(CommandContext)
  const id = useId()
  const ref = useRef<HTMLDivElement | null>(null)
  const handleSelect = useCallback(() => { onSelect?.() }, [onSelect])

  // Depends on `register`/`unregister` themselves, not the whole `context` object: same fix, same reason, as
  // Combobox's identical registration effect (see that file's comment) - `context` changes identity whenever
  // `items`/`query` change, which re-ran this effect on every registration and looped forever once someone typed.
  // Found the same way: a real browser, typing into a real Command, not a static check.
  const register = context?.register
  const unregister = context?.unregister
  useEffect(() => {
    if (register === undefined || unregister === undefined) return
    register(id, { text: value ?? (ref.current?.textContent ?? ''), disabled }, handleSelect)
    return () => { unregister(id) }
  }, [register, unregister, id, value, disabled, handleSelect])

  const visible = context === null || context.isVisible(id)
  return (
    <div
      ref={ref}
      id={id}
      data-slot="command-item"
      role="option"
      aria-selected={context?.activeId === id}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-hidden={!visible}
      data-selected={context?.activeId === id}
      className={clsx(css.item, className)}
      onClick={() => { if (!disabled) { context?.setActiveId(id); context?.choose(id) } }}
      onPointerMove={() => { if (!disabled) context?.setActiveId(id) }}
    >
      {children}
    </div>
  )
}

export function CommandShortcut({ children, className }: { children?: ReactNode, className?: string }) {
  return <span data-slot="command-shortcut" className={clsx(css.shortcut, className)}>{children}</span>
}