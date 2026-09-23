/**
 * Ported from shadcn/ui's Combobox (https://ui.shadcn.com/docs/components/combobox, MIT licence, registry item `combobox`, style new-york-v4, fetched
 * 2026-09-22). The searchable single-select combobox: a text field that filters a list, an anchored panel, groups with labels, an empty state and
 * keyboard selection.
 *
 * Restates the anchored-listbox shape written down in docs/pattern-anchored-listbox.md - points 1 to 5 for the anchoring half, 6 to 8 for the filtering
 * listbox half - and restates InputGroup's chrome for its own field, as that document's "Restating InputGroup's chrome" section requires. A shared
 * pattern restated, never an importable module: a cross-item import is what this registry's ingest gate rejects.
 *
 * THREE THINGS UPSTREAM HAS THAT THIS FIRST PASS DOES NOT, all deliberate and all recorded in manifest.yml:
 *
 * 1. The multi-select chips family (`ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`) is a documented follow-up rather than part of this pass, so
 *    this port is single-select only. A partial is acceptable when it is stated; a silent one is not.
 * 2. `ComboboxCollection` is not ported: it is Base UI's render-prop grouping helper with no local meaning, and this library does not invent a parallel
 *    rendering mechanism.
 * 3. Base UI's Positioner publishes `--anchor-width`, `--available-width`, `--available-height` and `--transform-origin`, and the source leans on all
 *    four. Here the panel's width comes from the anchor's own measured rect and the list's height from the space left in the viewport, and there is no
 *    portal - so an ancestor with `overflow: hidden` or a transform can clip the panel.
 *
 * Base UI's `data-highlighted` hook is kept for the active row, because that is what a caller styles against; `data-selected` marks the chosen one, and
 * `data-open`/`data-empty` carry the panel's state. The source's `data-open:animate-in`/`fade-in-0`/`zoom-in-95` animations have no equivalent, so this
 * port animates nothing rather than inventing keyframes. lucide-react's ChevronDownIcon/CheckIcon/XIcon became plain inline SVGs. See manifest.yml.
 */
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { InputHTMLAttributes, MutableRefObject, ReactNode } from 'react'
import css from './Combobox.module.css'

/** Case-insensitive substring, else every word of the query present. The same matcher the Command port uses. */
function matches(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = text.toLowerCase()
  if (haystack.includes(needle)) return true
  return needle.split(/\s+/u).every(word => haystack.includes(word))
}

interface ItemRecord { text: string, disabled: boolean }

interface ComboboxContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  value: string | null
  setValue: (value: string | null) => void
  query: string
  setQuery: (query: string) => void
  register: (id: string, record: ItemRecord, onSelect: (value: string) => void) => void
  unregister: (id: string) => void
  isVisible: (id: string) => boolean
  visibleCount: number
  registeredCount: number
  labelFor: (value: string | null) => string | null
  activeId: string | null
  setActiveId: (id: string | null) => void
  choose: (id: string) => void
  listId: string
  rootRef: MutableRefObject<HTMLDivElement | null>
  anchorRef: MutableRefObject<HTMLElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
  triggerRef: MutableRefObject<HTMLButtonElement | null>
}

const ComboboxContext = createContext<ComboboxContextValue | null>(null)

/**
 * Marks the element the panel should align to. Attach the returned ref to any element; when nothing is marked, the panel aligns to the field.
 * @returns the ref to attach.
 */
export function useComboboxAnchor(): MutableRefObject<HTMLElement | null> {
  return useRef<HTMLElement | null>(null)
}

export interface ComboboxProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  children?: ReactNode
}

/** Own the panel's open state, the chosen value and the query for everything inside the combobox. */
export function Combobox({ open: controlledOpen, defaultOpen = false, onOpenChange, value: controlledValue, defaultValue = null, onValueChange, children }: ComboboxProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const [uncontrolledValue, setUncontrolledValue] = useState<string | null>(defaultValue)
  const open = controlledOpen ?? uncontrolledOpen
  const value = controlledValue === undefined ? uncontrolledValue : controlledValue
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Record<string, ItemRecord>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const handlers = useRef(new Map<string, (value: string) => void>())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listId = useId()

  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [controlledOpen, onOpenChange])
  const setValue = useCallback((next: string | null) => {
    if (controlledValue === undefined) setUncontrolledValue(next)
    onValueChange?.(next)
  }, [controlledValue, onValueChange])

  const register = useCallback((id: string, record: ItemRecord, onSelect: (value: string) => void) => {
    handlers.current.set(id, onSelect)
    setItems(current => current[id]?.text === record.text && current[id]?.disabled === record.disabled ? current : { ...current, [id]: record })
  }, [])
  const unregister = useCallback((id: string) => {
    handlers.current.delete(id)
    setItems(current => { if (current[id] === undefined) return current; const next = { ...current }; delete next[id]; return next })
  }, [])

  // An item the registry has not seen yet is visible: registration happens in an effect, so judging an unknown id
  // would hide every row on the first paint and in any server render.
  const isVisible = useCallback((id: string) => {
    const record = items[id]
    if (record === undefined) return true
    return matches(record.text, query)
  }, [items, query])
  const registeredCount = Object.keys(items).length
  const visibleCount = Object.values(items).filter(record => matches(record.text, query)).length

  /** The label a chosen value should display, taken from whatever item registered it. */
  const labelFor = useCallback((wanted: string | null) => {
    if (wanted === null) return null
    for (const record of Object.values(items)) if (record.text === wanted) return record.text
    return wanted
  }, [items])

  useEffect(() => {
    const ids = Object.keys(items).filter(id => matches(items[id]?.text ?? '', query))
    setActiveId(current => current !== null && ids.includes(current) ? current : ids[0] ?? null)
  }, [items, query])

  useEffect(() => {
    if (activeId === null) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  // Selecting is the combobox's own job, not the item's: a single-select control owns its value, closes and resets.
  // Delegating this to each item's onSelect made the click path and the Enter path disagree.
  const choose = useCallback((id: string) => {
    const record = items[id]
    if (record === undefined || record.disabled) return
    setValue(record.text)
    handlers.current.get(id)?.(record.text)
    setOpen(false)
    setQuery('')
  }, [items, setValue, setOpen])

  const value_ = useMemo<ComboboxContextValue>(() => ({
    open, setOpen, value, setValue, query, setQuery, register, unregister, isVisible, visibleCount, registeredCount,
    labelFor, activeId, setActiveId, choose, listId, rootRef, anchorRef, contentRef, triggerRef,
  }), [open, setOpen, value, setValue, query, register, unregister, isVisible, visibleCount, registeredCount, labelFor, activeId, choose, listId])

  return (
    <ComboboxContext.Provider value={value_}>
      <div ref={rootRef} data-slot="combobox" data-open={open} className={css.anchor}>{children}</div>
    </ComboboxContext.Provider>
  )
}

export interface ComboboxInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  placeholder?: string
}

/** The field: InputGroup's chrome restated around a control bound to the query, with a clear button. */
export function ComboboxInput({ className, placeholder, ...rest }: ComboboxInputProps) {
  const context = useContext(ComboboxContext)
  const move = (delta: number): void => {
    const ids = walkableIds(context)
    if (ids.length === 0) return
    const at = context?.activeId === null || context?.activeId === undefined ? -1 : ids.indexOf(context.activeId)
    const next = at === -1 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length
    context?.setActiveId(ids[next] ?? null)
  }
  return (
    <div data-slot="input-group" className={css.group}>
      <input
        data-slot="input-group-control"
        role="combobox"
        aria-expanded={context?.open ?? false}
        aria-controls={context?.listId}
        aria-activedescendant={context?.open === true ? context.activeId ?? undefined : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className={clsx(css.control, className)}
        value={context?.query ?? ''}
        onChange={event => { context?.setQuery(event.target.value) }}
        onFocus={() => { context?.setOpen(true) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); if (context?.open === true) move(1); else context?.setOpen(true); return }
          if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
          if (event.key === 'Home' && context?.open === true) { event.preventDefault(); context.setActiveId(walkableIds(context)[0] ?? null); return }
          if (event.key === 'End' && context?.open === true) {
            event.preventDefault()
            const ids = walkableIds(context)
            context.setActiveId(ids[ids.length - 1] ?? null)
            return
          }
          if (event.key === 'Enter' && context?.open === true && context.activeId !== null) {
            event.preventDefault()
            context.choose(context.activeId)   // chooses, sets the value, closes and resets the query
          }
        }}
        {...rest}
      />
      <div data-slot="input-group-addon" data-align="inline-end" className={clsx(css.addon, css.addonEnd)}>
        <ComboboxClear />
        <ComboboxTrigger />
      </div>
    </div>
  )
}

/** The ids a keyboard walk should move through, in DOM order - read at key time, never tracked in state. */
function walkableIds(context: ComboboxContextValue | null): string[] {
  const root = context?.rootRef.current
  if (root === null || root === undefined) return []
  return [...root.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')]
    .filter(node => node.getAttribute('data-hidden') !== 'true' && node.getAttribute('data-disabled') !== 'true')
    .map(node => node.id)
    .filter(id => id !== '')
}

/** Clears the chosen value. Disabled while there is nothing to clear. */
export function ComboboxClear({ className }: { className?: string }) {
  const context = useContext(ComboboxContext)
  return (
    <button
      type="button"
      data-slot="combobox-clear"
      aria-label="Clear selection"
      disabled={context?.value === null || context?.value === undefined}
      className={clsx(css.clear, className)}
      onClick={() => { context?.setValue(null); context?.setQuery('') }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </button>
  )
}

/** Opens and closes the panel. */
export function ComboboxTrigger({ label = 'Show options', className }: { label?: string, className?: string }) {
  const context = useContext(ComboboxContext)
  return (
    <button
      type="button"
      ref={element => { if (context !== null) context.triggerRef.current = element }}
      data-slot="combobox-trigger"
      aria-haspopup="listbox"
      aria-expanded={context?.open ?? false}
      aria-label={label}
      className={clsx(css.trigger, className)}
      onClick={() => { context?.setOpen(!(context?.open ?? false)) }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </button>
  )
}

/** Renders the chosen value's label, or `placeholder` when nothing is chosen. */
export function ComboboxValue({ placeholder = '', className }: { placeholder?: string, className?: string }) {
  const context = useContext(ComboboxContext)
  const label = context?.labelFor(context?.value ?? null) ?? null
  if (label !== null && label !== '') return <span data-slot="combobox-value" className={clsx(css.value, className)}>{label}</span>
  return <span data-slot="combobox-value" data-placeholder="true" className={clsx(css.value, className)}>{placeholder}</span>
}

export interface ComboboxContentProps {
  children?: ReactNode
  className?: string
}

/**
 * The anchored panel. Renders nothing until the combobox is open.
 * @param props - the panel's content.
 * @returns the element.
 */
export function ComboboxContent({ children, className }: ComboboxContentProps) {
  const context = useContext(ComboboxContext)
  const open = context?.open ?? false
  const [style, setStyle] = useState<{ left: number, top: number, width: number, maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) { setStyle(null); return }
    const measure = (): void => {
      const reference = context?.anchorRef.current ?? context?.rootRef.current?.querySelector('[data-slot="input-group"]') ?? null
      const panel = context?.contentRef.current
      if (reference === null || panel === null) return
      const rect = reference.getBoundingClientRect()
      const width = rect.width
      const below = rect.bottom + 4
      const spaceBelow = window.innerHeight - below - 8
      const spaceAbove = rect.top - 8
      const flip = spaceBelow < 160 && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(320, flip ? spaceAbove : spaceBelow))
      const left = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - width - 8))
      setStyle({ left, top: flip ? Math.max(8, rect.top - 4 - maxHeight) : below, width, maxHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [open, context])

  useEffect(() => {
    if (!open || context === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      context.setOpen(false)
      context.rootRef.current?.querySelector<HTMLElement>('[data-slot="input-group-control"]')?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (context.rootRef.current?.contains(target) === true) return
      if (context.contentRef.current?.contains(target) === true) return
      context.setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown) }
  }, [open, context])

  if (!open) return null
  const empty = context !== null && context.registeredCount > 0 && context.visibleCount === 0
  return (
    <div
      ref={element => { if (context !== null) context.contentRef.current = element }}
      data-slot="combobox-content"
      data-open="true"
      data-empty={empty}
      className={clsx(css.content, className)}
      style={style === null ? { visibility: 'hidden' } : { left: style.left, top: style.top, width: style.width, maxHeight: style.maxHeight }}
    >
      {children}
    </div>
  )
}

export function ComboboxList({ children, className }: { children?: ReactNode, className?: string }) {
  const context = useContext(ComboboxContext)
  return <div data-slot="combobox-list" role="listbox" id={context?.listId} className={clsx(css.list, className)}>{children}</div>
}

export function ComboboxGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="combobox-group" role="group" className={clsx(css.groupBlock, className)}>{children}</div>
}

export function ComboboxLabel({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="combobox-label" className={clsx(css.label, className)}>{children}</div>
}

/** Shows only once items have registered and none of them match. The panel reports `data-empty` for the same reason. */
export function ComboboxEmpty({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="combobox-empty" className={clsx(css.empty, className)}>{children}</div>
}

export function ComboboxSeparator({ className }: { className?: string }) {
  return <div data-slot="combobox-separator" role="separator" className={clsx(css.separator, className)} />
}

export interface ComboboxItemProps {
  /** The text this item is matched against and the value reported on selection. Defaults to the item's own text content. */
  value?: string
  disabled?: boolean
  onSelect?: (value: string) => void
  children?: ReactNode
  className?: string
}

/** One option. `data-highlighted` marks the active row and `data-selected` the chosen one; a filtered-out row is display-none. */
export function ComboboxItem({ value, disabled = false, onSelect, children, className }: ComboboxItemProps) {
  const context = useContext(ComboboxContext)
  const id = useId()
  const ref = useRef<HTMLDivElement | null>(null)
  const handleSelect = useCallback((selected: string) => { onSelect?.(selected) }, [onSelect])

  // Depends on `register`/`unregister` themselves, not the whole `context` object: `context` is a `useMemo` that gets
  // a new identity whenever `items` or `query` change (through `isVisible`/`labelFor`, which are keyed on both), but
  // `register`/`unregister` are their own `useCallback`s with no dependencies, so they never change identity. Depending
  // on `context` here re-ran this effect on every registration - unregistering then re-registering every item on every
  // keystroke, which is itself another `items` change, which is another `context` identity change: an infinite loop
  // (React error #185), found by typing into a real Combobox in a real browser, not by any static check.
  const register = context?.register
  const unregister = context?.unregister
  useEffect(() => {
    if (register === undefined || unregister === undefined) return
    register(id, { text: value ?? (ref.current?.textContent ?? ''), disabled }, handleSelect)
    return () => { unregister(id) }
  }, [register, unregister, id, value, disabled, handleSelect])

  const text = value ?? ''
  // The chosen value IS an item's text, so selecting is a straight comparison - no label lookup needed here.
  const selected = text !== '' && context?.value === text
  const visible = context === null || context.isVisible(id)
  return (
    <div
      ref={ref}
      id={id}
      data-slot="combobox-item"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      data-disabled={disabled}
      data-hidden={!visible}
      data-highlighted={context?.activeId === id}
      data-selected={selected}
      className={clsx(css.item, className)}
      onClick={() => {
        if (disabled) return
        context?.setActiveId(id)
        context?.choose(id)
      }}
      onPointerMove={() => { if (!disabled) context?.setActiveId(id) }}
    >
      {children}
      {selected && (
        <span data-slot="combobox-item-indicator" className={css.itemIndicator}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
        </span>
      )}
    </div>
  )
}