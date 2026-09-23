/**
 * Ported from shadcn/ui's Carousel (https://ui.shadcn.com/docs/components/carousel, MIT licence, registry item `carousel`, style new-york-v4, fetched
 * 2026-09-22). `embla-carousel-react` is dropped for CSS scroll snap, the same call the Scroll Area port made: the platform already scrolls, and it can
 * already snap. The viewport keeps `overflow: auto` with `scroll-snap-type` on the track's axis, every item takes one viewport and declares
 * `scroll-snap-align: start`, the arrows scroll by exactly one item, and `canScrollPrev`/`canScrollNext` are read off the scroller's own geometry
 * (`position > 0`, `position < span - viewport`) on `scroll`, on resize and after every render, so a caller adding items does not leave the arrows stale.
 *
 * The `CarouselApi` this item publishes is deliberately smaller than embla's: `scrollPrev`, `scrollNext`, `scrollTo(index)`, `canScrollPrev`,
 * `canScrollNext` and `selectedIndex`, exposed through the source's own `setApi` prop. Embla's `reInit` events, its `scrollTo` options, its drag physics
 * and its plugin system are NOT reproduced - a deliberate partial recorded in manifest.yml, the same shape of decision as vaul's velocity flick in Drawer.
 *
 * `CarouselPrevious`/`CarouselNext` restate shadcn's Button locally (outline, icon size, round, absolutely placed at the track's edges) because the
 * ingest gate rejects a cross-item import; PaginationLink, AttachmentAction and ToggleGroupItem already restate the same chrome.
 *
 * Kept from the source: `role="region"` with `aria-roledescription="carousel"` on the root, `role="group"` with `aria-roledescription="slide"` per item,
 * ArrowLeft/ArrowRight handled in the capture phase on the root so a focused arrow button still moves the track, a screen-reader-only label inside each
 * arrow, `disabled` from the can-scroll state, both orientations and the `data-slot` names. Nothing here keys off `:has()` and nothing transitions a
 * property a `:has()` rule sets, so this item is not exposed to the engine split InputGroup hit.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, MutableRefObject } from 'react'
import css from './Carousel.module.css'

export type CarouselOrientation = 'horizontal' | 'vertical'

/**
 * The handles a caller gets through `setApi`. This is a subset of embla's api, on purpose: embla's events, scroll options, drag physics and plugins have no
 * equivalent here, because the platform's scroller does the moving.
 */
export interface CarouselApi {
  /** Move one item towards the start. */
  scrollPrev: () => void
  /** Move one item towards the end. */
  scrollNext: () => void
  /** Move so that the item at `index` is at the start of the viewport. */
  scrollTo: (index: number) => void
  /** Whether there is anything before the first visible item. */
  canScrollPrev: () => boolean
  /** Whether there is anything after the last visible item. */
  canScrollNext: () => boolean
  /** The index of the item at the start of the viewport. */
  selectedIndex: () => number
}

interface CarouselContextValue {
  trackRef: MutableRefObject<HTMLDivElement | null>
  orientation: CarouselOrientation
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
}

const CarouselContext = createContext<CarouselContextValue | null>(null)

export interface CarouselProps extends HTMLAttributes<HTMLDivElement> {
  /** Which axis the track slides along. Vertical needs a definite height on `CarouselContent`, the way ScrollArea needs one on itself. */
  orientation?: CarouselOrientation
  /** Called once with the api, so a caller can drive the carousel from its own controls. */
  setApi?: (api: CarouselApi) => void
}

/**
 * Own the carousel: the track's scroll position, the arrow-key handling and the can-scroll state its arrows read.
 * @param props - `orientation`, `setApi`, and normal `<div>` attributes; `className` and `style` land on the root region.
 * @returns the element, with `role="region"` and `aria-roledescription="carousel"`.
 */
export function Carousel({ orientation = 'horizontal', setApi, children, className, ...rest }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const api = useMemo<CarouselApi>(() => {
    const axis = (element: HTMLDivElement): { position: number, span: number, viewport: number } => orientation === 'horizontal'
      ? { position: element.scrollLeft, span: element.scrollWidth, viewport: element.clientWidth }
      : { position: element.scrollTop, span: element.scrollHeight, viewport: element.clientHeight }
    // One item, measured off the first one rather than assumed to be the viewport: a caller who gives every item `basis-1/2` gets half-viewport steps.
    const step = (element: HTMLDivElement): number => {
      const first = element.firstElementChild?.firstElementChild ?? null
      const size = first instanceof HTMLElement ? (orientation === 'horizontal' ? first.offsetWidth : first.offsetHeight) : 0
      return size > 0 ? size : axis(element).viewport
    }
    const goTo = (target: number): void => {
      const element = trackRef.current
      if (element === null) return
      const { span, viewport } = axis(element)
      const clamped = Math.min(Math.max(target, 0), Math.max(0, span - viewport))
      element.scrollTo(orientation === 'horizontal' ? { left: clamped, behavior: 'smooth' } : { top: clamped, behavior: 'smooth' })
    }
    return {
      scrollPrev: () => { const element = trackRef.current; if (element !== null) goTo(axis(element).position - step(element)) },
      scrollNext: () => { const element = trackRef.current; if (element !== null) goTo(axis(element).position + step(element)) },
      scrollTo: index => { const element = trackRef.current; if (element !== null) goTo(index * step(element)) },
      canScrollPrev: () => { const element = trackRef.current; return element !== null && axis(element).position > 1 },
      canScrollNext: () => {
        const element = trackRef.current
        if (element === null) return false
        const { position, span, viewport } = axis(element)
        return position < span - viewport - 1
      },
      selectedIndex: () => { const element = trackRef.current; return element === null ? 0 : Math.round(axis(element).position / step(element)) },
    }
  }, [orientation])

  const sync = useCallback(() => {
    const element = trackRef.current
    if (element === null) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [api])

  useLayoutEffect(() => {
    const element = trackRef.current
    if (element === null) return
    sync()
    element.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      observer.disconnect()
    }
  }, [sync])

  // A resize observer sees the viewport change, not the content: adding or removing items moves `scrollWidth` without touching the track's box.
  useEffect(() => { sync() })

  useEffect(() => { setApi?.(api) }, [api, setApi])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    if (event.key === 'ArrowLeft') api.scrollPrev()
    else api.scrollNext()
  }

  const value = useMemo<CarouselContextValue>(() => ({
    trackRef,
    orientation,
    scrollPrev: api.scrollPrev,
    scrollNext: api.scrollNext,
    canScrollPrev,
    canScrollNext,
  }), [api, orientation, canScrollPrev, canScrollNext])

  return (
    <CarouselContext.Provider value={value}>
      <div
        onKeyDownCapture={onKeyDown}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        className={clsx(css.root, className)}
        {...rest}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

/**
 * The scroller. Give it a height directly for a vertical carousel, the way Scroll Area's own docs give one.
 * @param props - normal `<div>` attributes; `className` and `style` land on the scroller itself, which is the element that needs the height.
 * @returns the element, wrapping the flex track that holds the items.
 */
export function CarouselContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(CarouselContext)
  const orientation = context?.orientation ?? 'horizontal'
  return (
    <div
      ref={element => { if (context !== null) context.trackRef.current = element }}
      data-slot="carousel-content"
      data-orientation={orientation}
      className={clsx(css.content, className)}
      {...rest}
    >
      <div data-orientation={orientation} className={css.track}>{children}</div>
    </div>
  )
}

/** One slide. It takes the whole viewport by default, and a caller can narrow it (`className` with a basis) to show several at once. */
export function CarouselItem({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(CarouselContext)
  const orientation = context?.orientation ?? 'horizontal'
  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      data-orientation={orientation}
      className={clsx(css.item, className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface CarouselArrowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The button's screen-reader-only text. It defaults to the source's own wording. */
  label?: string
}

/** The button that moves the track one item towards the start. It is disabled when there is nothing before the first visible item. */
export function CarouselPrevious({ label = 'Previous slide', className, ...rest }: CarouselArrowProps) {
  const context = useContext(CarouselContext)
  return (
    <button
      type="button"
      data-slot="carousel-previous"
      data-orientation={context?.orientation ?? 'horizontal'}
      disabled={!(context?.canScrollPrev ?? false)}
      onClick={() => context?.scrollPrev()}
      className={clsx(css.arrow, css.previous, className)}
      {...rest}
    >
      <ArrowLeftIcon />
      <span className={css.srOnly}>{label}</span>
    </button>
  )
}

/** The button that moves the track one item towards the end. It is disabled when there is nothing after the last visible item. */
export function CarouselNext({ label = 'Next slide', className, ...rest }: CarouselArrowProps) {
  const context = useContext(CarouselContext)
  return (
    <button
      type="button"
      data-slot="carousel-next"
      data-orientation={context?.orientation ?? 'horizontal'}
      disabled={!(context?.canScrollNext ?? false)}
      onClick={() => context?.scrollNext()}
      className={clsx(css.arrow, css.next, className)}
      {...rest}
    >
      <ArrowRightIcon />
      <span className={css.srOnly}>{label}</span>
    </button>
  )
}

function ArrowLeftIcon() {
  return (
    <svg className={css.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className={css.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 5 7 7-7 7" />
      <path d="M5 12h14" />
    </svg>
  )
}