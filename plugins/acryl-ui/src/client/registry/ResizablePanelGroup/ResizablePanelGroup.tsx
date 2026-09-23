/**
 * Ported from shadcn/ui's Resizable (https://ui.shadcn.com/docs/components/resizable, MIT licence, registry item `resizable`, style new-york-v4, fetched
 * 2026-09-22; the underlying prop semantics are v4 of `react-resizable-panels`, whose published types were read at 4.13.2 on the same date). The item's
 * contract key is the export that is its root, `ResizablePanelGroup`, because shadcn's item exports no component named `Resizable` and a registry contract key
 * has to be a real runtime export - the same rename `DirectionProvider` took for shadcn's `direction` item, with the catalogue's category left as Resizable.
 *
 * `react-resizable-panels` is dropped and its behaviour written by hand, because a client bundle here may require only react, react/jsx-runtime and the app
 * primitives (the built-bundle test enforces it) and because the part this library needs is a small amount of arithmetic on the group's own rect. The group
 * owns the layout as a map of panel id to percentage; a separator drags its two neighbours by capturing the pointer and projecting the movement onto the
 * group's axis, and the keyboard moves the same pair by 5 percent per arrow (Home and End to an end, the source's own steps).
 *
 * Restates the anchored-listbox shape's dismissal-free half from docs/pattern-anchored-listbox.md only where it applies: there is no overlay, no registry
 * and no anchor here, so what carries over is the pointer-capture drag the Drawer port established plus the source's ARIA contract.
 *
 * What is NOT carried over, all deliberate partials recorded in manifest.yml: pixel sizes (every size here is a percentage, and the unit of a string is
 * ignored - the source reads a bare number as pixels), `collapsedThreshold`, `groupResizeBehavior`, `defaultLayout`, `disabled`, `resizePreviewMode`, the
 * imperative `panelRef`/`groupRef` handles, `useDefaultLayout` persistence, `onLayoutChanged`'s `isUserInteraction` second argument, the F6 focus walk and
 * the double-click reset. `aria-valuemin`/`aria-valuemax` report what the pair can actually reach, which is the window the source computes by simulating a
 * delta, so a neighbour that cannot shrink narrows it. Enter acts on the panel BEFORE the separator, the one the source collapses.
 */
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import css from './ResizablePanelGroup.module.css'

export type ResizableOrientation = 'horizontal' | 'vertical'

/** The group's layout: panel id to its share of the group, as a percentage. */
export type ResizableLayout = Record<string, number>

/** A panel's own limits, in percent. `floor` is where a drag or a key press stops it going below. */
export interface ResizableBounds {
  floor: number
  ceiling: number
}

interface PanelRegistration {
  defaultSize: number | undefined
  minSize: number
  maxSize: number
  collapsible: boolean
  collapsedSize: number
}

interface GroupContextValue {
  orientation: ResizableOrientation
  layout: ResizableLayout
  bounds: (id: string) => ResizableBounds
  isCollapsible: (id: string) => boolean
  register: (id: string, registration: PanelRegistration) => void
  /** Move the first panel of a pair to `target`, keeping the pair's total and both panels inside their own limits. */
  applyPair: (before: string, after: string, target: number) => void
  /** Collapse a collapsible panel to its collapsed size, or back to the size it had before it collapsed. */
  toggleCollapse: (id: string, after: string) => void
}

const ResizableGroupContext = createContext<GroupContextValue | null>(null)

const DEFAULT_BOUNDS: ResizableBounds = { floor: 0, ceiling: 100 }
const EPSILON = 0.0001

/**
 * Read a size prop as a percentage. This port is percentages-only: a number is a percentage, and the unit of a string is ignored, so `"50%"` and `"50"`
 * both mean half. The upstream library reads a bare number as pixels, which is why its own docs write `defaultSize="50%"` - the form all the documented
 * examples use, and the one this port's rule is built around.
 */
function toPercent(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sameRegistration(left: PanelRegistration, right: PanelRegistration): boolean {
  return left.defaultSize === right.defaultSize && left.minSize === right.minSize && left.maxSize === right.maxSize
    && left.collapsible === right.collapsible && left.collapsedSize === right.collapsedSize
}

export interface ResizablePanelGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Which way the panels sit and are resized. Defaults to `horizontal`. */
  orientation?: ResizableOrientation
  /** Called with the whole layout, in percent, whenever it changes - the first computed one included. */
  onLayoutChange?: (layout: ResizableLayout) => void
}

/**
 * Own the layout for a set of panels and the handles between them.
 * @param props - the orientation, an optional layout callback, and normal `<div>` attributes; give it a size, since it fills its parent.
 * @returns the flex container that the panels and handles must be direct children of.
 */
export function ResizablePanelGroup({ orientation = 'horizontal', onLayoutChange, children, className, ...rest }: ResizablePanelGroupProps) {
  const [panels, setPanels] = useState<Record<string, PanelRegistration>>({})
  const [layout, setLayout] = useState<ResizableLayout>({})
  const expanded = useRef<Map<string, number>>(new Map())

  const register = useCallback((id: string, registration: PanelRegistration) => {
    setPanels(current => {
      const existing = current[id]
      if (existing !== undefined && sameRegistration(existing, registration)) return current
      return { ...current, [id]: registration }
    })
  }, [])

  const bounds = useCallback((id: string): ResizableBounds => {
    const entry = panels[id]
    if (entry === undefined) return DEFAULT_BOUNDS
    return { floor: entry.collapsible ? entry.collapsedSize : entry.minSize, ceiling: entry.maxSize }
  }, [panels])

  const isCollapsible = useCallback((id: string): boolean => panels[id]?.collapsible ?? false, [panels])

  // The panels register themselves, so the group does not know their sizes while it renders; this is the pass that turns their declarations into a layout,
  // and it runs before paint. Panels without a declared size share what is left, and the result is normalised to 100 so `aria-valuenow` is a true share.
  useLayoutEffect(() => {
    setLayout(current => {
      const ids = Object.keys(panels)
      if (ids.length === 0 || ids.every(id => current[id] !== undefined)) return current
      const next: ResizableLayout = {}
      const undeclared: string[] = []
      let declared = 0
      for (const id of ids) {
        const entry = panels[id] as PanelRegistration
        const size = current[id] ?? entry.defaultSize
        if (size === undefined) { undeclared.push(id); continue }
        const clamped = Math.min(Math.max(size, entry.minSize), entry.maxSize)
        next[id] = clamped
        declared += clamped
      }
      const share = undeclared.length === 0 ? 0 : Math.max(0, 100 - declared) / undeclared.length
      for (const id of undeclared) next[id] = share
      const total = Object.values(next).reduce((sum, value) => sum + value, 0)
      if (total <= 0) {
        const even = 100 / ids.length
        for (const id of ids) next[id] = even
        return next
      }
      if (Math.abs(total - 100) > EPSILON) for (const id of ids) next[id] = (next[id] as number) / total * 100
      return next
    })
  }, [panels])

  // Remember the size a collapsible panel had, so the key that collapses it can also bring it back.
  useEffect(() => {
    for (const [id, size] of Object.entries(layout)) {
      const entry = panels[id]
      if (entry === undefined || !entry.collapsible) continue
      if (size > entry.collapsedSize + EPSILON) expanded.current.set(id, size)
    }
  }, [layout, panels])

  const notified = useRef<ResizableLayout | null>(null)
  useEffect(() => {
    if (Object.keys(layout).length === 0 || notified.current === layout) return
    notified.current = layout
    onLayoutChange?.(layout)
  }, [layout, onLayoutChange])

  const applyPair = useCallback((before: string, after: string, target: number) => {
    setLayout(current => {
      const beforeSize = current[before]
      const afterSize = current[after]
      if (beforeSize === undefined || afterSize === undefined) return current
      const total = beforeSize + afterSize
      const beforeBounds = bounds(before)
      const afterBounds = bounds(after)
      let next = Math.min(Math.max(target, beforeBounds.floor), beforeBounds.ceiling)
      // Keep the pair's total, so the neighbour cannot be pushed past its own limits by this move.
      next = Math.min(Math.max(next, total - afterBounds.ceiling), total - afterBounds.floor)
      if (Math.abs(next - beforeSize) < EPSILON) return current
      return { ...current, [before]: next, [after]: total - next }
    })
  }, [bounds])

  const toggleCollapse = useCallback((id: string, after: string) => {
    const entry = panels[id]
    if (entry === undefined || !entry.collapsible) return
    const size = layout[id] ?? 0
    const collapsed = entry.collapsedSize
    const target = Math.abs(size - collapsed) < EPSILON ? expanded.current.get(id) ?? entry.minSize : collapsed
    applyPair(id, after, target)
  }, [applyPair, layout, panels])

  const value = useMemo<GroupContextValue>(() => ({ orientation, layout, bounds, isCollapsible, register, applyPair, toggleCollapse }),
    [orientation, layout, bounds, isCollapsible, register, applyPair, toggleCollapse])

  return (
    <ResizableGroupContext.Provider value={value}>
      <div data-slot="resizable-panel-group" data-orientation={orientation} className={clsx(css.group, className)} {...rest}>
        {children}
      </div>
    </ResizableGroupContext.Provider>
  )
}

export interface ResizablePanelProps extends HTMLAttributes<HTMLDivElement> {
  /** A stable id, which is also the key this panel gets in the layout. Generated when omitted. */
  id?: string
  /** Its share of the group, in percent. Panels without one share what the others leave. */
  defaultSize?: number | string
  /** The smallest it may be resized to, in percent. */
  minSize?: number | string
  /** The largest it may be resized to, in percent. Defaults to 100. */
  maxSize?: number | string
  /** Whether the key on the adjacent handle collapses it. */
  collapsible?: boolean
  /** Where it collapses to, in percent. Defaults to 0. */
  collapsedSize?: number | string
}

/**
 * One resizable area. It must be a direct child of `ResizablePanelGroup`; its own `className` and `style` land on the inner box, which is the one that
 * carries the content, while the outer box carries the size.
 * @param props - the size and limits, and normal `<div>` attributes.
 * @returns the element.
 */
export function ResizablePanel({ id: idProp, defaultSize, minSize, maxSize, collapsible = false, collapsedSize = 0, className, style, children, ...rest }: ResizablePanelProps) {
  const context = useContext(ResizableGroupContext)
  const generated = useId()
  const id = idProp ?? generated
  const declared = defaultSize === undefined ? undefined : toPercent(defaultSize)
  const min = toPercent(minSize ?? 0)
  const max = toPercent(maxSize ?? 100)
  const collapsed = toPercent(collapsedSize)
  const register = context?.register

  useEffect(() => {
    register?.(id, { defaultSize: declared, minSize: min, maxSize: max, collapsible, collapsedSize: collapsed })
  }, [register, id, declared, min, max, collapsible, collapsed])

  // Before the group has computed the layout, the declared shares are themselves the flex ratios, which is the same picture one pass early.
  const size = context?.layout[id] ?? declared ?? 1
  const outerStyle: CSSProperties = { flexGrow: size, flexBasis: 0, flexShrink: 0 }

  return (
    <div id={id} data-slot="resizable-panel" data-panel className={css.panel} style={outerStyle} {...rest}>
      <div className={clsx(css.panelInner, className)} style={style}>{children}</div>
    </div>
  )
}

export interface ResizableHandleProps extends HTMLAttributes<HTMLDivElement> {
  /** Show the small grip in the middle of the divider. It is decoration; the whole divider is the target. */
  withHandle?: boolean
}

/**
 * The divider between two panels: drag it, or focus it and use the arrow keys, Home/End, or the key that collapses a collapsible neighbour.
 * @param props - `withHandle`, and normal `<div>` attributes.
 * @returns the element, with `role="separator"` and the ARIA values its panel reports.
 */
export function ResizableHandle({ withHandle = false, className, ...rest }: ResizableHandleProps) {
  const context = useContext(ResizableGroupContext)
  const elementRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ startCoordinate: number, startSize: number, length: number, pointerId: number } | null>(null)
  const [pair, setPair] = useState<{ before: string | null, after: string | null }>({ before: null, after: null })
  const [dragging, setDragging] = useState(false)
  const orientation = context?.orientation ?? 'horizontal'
  // A horizontal group's divider runs vertically, which is what both the ARIA and the module's rules key off.
  const separatorOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal'

  // The panels are siblings in the DOM, and reading them here is what makes this item order-independent: React runs child effects in tree order, so a
  // registry built from them would be built bottom-up.
  useLayoutEffect(() => {
    const element = elementRef.current
    if (element === null) return
    const before = element.previousElementSibling
    const after = element.nextElementSibling
    const beforeId = before instanceof HTMLElement && before.hasAttribute('data-panel') ? before.id : null
    const afterId = after instanceof HTMLElement && after.hasAttribute('data-panel') ? after.id : null
    setPair(current => (current.before === beforeId && current.after === afterId ? current : { before: beforeId, after: afterId }))
  }, [])

  const beforeSize = pair.before === null ? undefined : context?.layout[pair.before]
  const afterSize = pair.after === null ? undefined : context?.layout[pair.after]
  const limits = pair.before === null ? undefined : context?.bounds(pair.before)
  const neighbour = pair.after === null ? undefined : context?.bounds(pair.after)
  // What the divider can actually reach, which is not always the panel's own window: a neighbour that cannot shrink stops it sooner. The source computes
  // the same thing by simulating a delta across the pair.
  const reach =
    beforeSize === undefined || afterSize === undefined || limits === undefined || neighbour === undefined
      ? undefined
      : {
          floor: Math.round(Math.max(limits.floor, beforeSize + afterSize - neighbour.ceiling)),
          ceiling: Math.round(Math.min(limits.ceiling, beforeSize + afterSize - neighbour.floor)),
        }

  const shift = (delta: number): void => {
    if (pair.before === null || pair.after === null || beforeSize === undefined) return
    context?.applyPair(pair.before, pair.after, beforeSize + delta)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowLeft': if (orientation !== 'horizontal') return; event.preventDefault(); shift(-5); break
      case 'ArrowRight': if (orientation !== 'horizontal') return; event.preventDefault(); shift(5); break
      case 'ArrowUp': if (orientation !== 'vertical') return; event.preventDefault(); shift(-5); break
      case 'ArrowDown': if (orientation !== 'vertical') return; event.preventDefault(); shift(5); break
      case 'Home': event.preventDefault(); shift(-100); break
      case 'End': event.preventDefault(); shift(100); break
      case 'Enter':
        if (pair.before === null || pair.after === null) return
        event.preventDefault()
        context?.toggleCollapse(pair.before, pair.after)
        break
      default: break
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = elementRef.current
    const group = element?.parentElement ?? null
    if (element === null || group === null || pair.before === null || pair.after === null) return
    const rect = group.getBoundingClientRect()
    const length = orientation === 'horizontal' ? rect.width : rect.height
    if (length <= 0) return
    element.setPointerCapture(event.pointerId)
    drag.current = {
      startCoordinate: orientation === 'horizontal' ? event.clientX : event.clientY,
      startSize: beforeSize ?? 0,
      length,
      pointerId: event.pointerId,
    }
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === null || pair.before === null || pair.after === null) return
    const coordinate = orientation === 'horizontal' ? event.clientX : event.clientY
    context?.applyPair(pair.before, pair.after, state.startSize + (coordinate - state.startCoordinate) / state.length * 100)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = elementRef.current
    if (element !== null && drag.current !== null && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    drag.current = null
    setDragging(false)
  }

  return (
    <div
      ref={elementRef}
      role="separator"
      aria-orientation={separatorOrientation}
      aria-controls={pair.before ?? undefined}
      aria-valuenow={beforeSize === undefined ? undefined : Math.round(beforeSize)}
      aria-valuemin={reach?.floor}
      aria-valuemax={reach?.ceiling}
      tabIndex={0}
      data-slot="resizable-handle"
      data-orientation={separatorOrientation}
      data-dragging={dragging ? 'true' : 'false'}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={clsx(css.handle, className)}
      {...rest}
    >
      {withHandle ? (
        <div className={clsx(css.grip, separatorOrientation === 'horizontal' && css.gripHorizontal)}>
          <GripIcon />
        </div>
      ) : null}
    </div>
  )
}

function GripIcon() {
  return (
    <svg className={css.gripIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
    </svg>
  )
}