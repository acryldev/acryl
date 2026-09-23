/**
 * Ported from shadcn/ui's Calendar (https://ui.shadcn.com/docs/components/calendar, MIT licence, registry item `calendar`, style new-york-v4, fetched
 * 2026-09-22). `react-day-picker` and `date-fns` are dropped and the month grid is hand-rolled: the item upstream is a theme over a date-picker engine, and the
 * engine is the part this library can write itself with the platform's own date arithmetic and `Intl` for the names, the same call ScrollArea made for the
 * platform's scroller and Carousel made for CSS scroll snap.
 *
 * What shipped: one month at a time, a real `role="grid"` of columns and rows, single and range selection, `showOutsideDays`, a `weekStartsOn`, a day-level
 * `disabled` predicate, today marked, and the keyboard model a date grid needs - a roving tab stop on the focused day, arrows by day and by week, Home and
 * End to the week's ends, PageUp/PageDown by month, Enter or Space to choose. The month a reader is looking at follows the focused day, so paging by key
 * moves the grid rather than losing focus off the end of it.
 *
 * What did NOT come with it, all recorded in manifest.yml as deliberate partials: `react-day-picker`'s multi-month (`numberOfMonths`), its dropdown caption
 * layout, its week numbers, its `formatters`/`classNames`/`components` extension points (a consumer styles this port through its `data-*` hooks and
 * `className` instead), its uncontrolled `defaultSelected`, its rich disabled matchers (dates, ranges, day-of-week sets - this port takes a predicate), and
 * its `CalendarDayButton` export, whose purpose upstream is to let a caller replace the day button. Selection is controlled: `selected` and `onSelect`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { KeyboardEvent, ReactNode } from 'react'
import css from './Calendar.module.css'

export type CalendarMode = 'single' | 'range'

/** A range as this item reports it: either end may still be open while a reader is choosing. */
export interface CalendarRange {
  from: Date | null
  to: Date | null
}

export type CalendarSelection = Date | CalendarRange

export interface CalendarProps {
  /** `single` chooses one day, `range` chooses two and shades what lies between them. */
  mode?: CalendarMode
  /** The chosen day, or the chosen range. Controlled, so the caller owns it. */
  selected?: CalendarSelection
  /** Called with the next selection: a date in `single` mode, a range in `range` mode. */
  onSelect?: (selection: CalendarSelection) => void
  /** The month on screen. Controlled alongside `onMonthChange`. */
  month?: Date
  /** The month on screen to start from, when the caller does not control it. */
  defaultMonth?: Date
  /** Called when the reader pages to another month. */
  onMonthChange?: (month: Date) => void
  /** Whether the days of the neighbouring months are shown greyed. Defaults to true, as upstream does. */
  showOutsideDays?: boolean
  /** Which day a week starts on, 0 being Sunday. Defaults to 0, the en-US week upstream assumes. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** A BCP 47 tag for the month and weekday names. Defaults to `en-US`. */
  locale?: string
  /** Days this returns true for are shown, marked and unselectable. */
  disabled?: (date: Date) => boolean
  className?: string
  children?: ReactNode
}

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1)
const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
// Clamped to the target month's length: the Date constructor would roll 31 March plus a month into 1 May.
const addMonths = (date: Date, months: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), daysInMonth(target)))
}
const sameDay = (left: Date, right: Date): boolean => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
/** The key a day is addressable by, in the DOM and in state. Local, so a reader in any zone sees the date they clicked. */
const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const daysInMonth = (date: Date): number => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()

const asRange = (selection: CalendarSelection | undefined): CalendarRange => {
  if (selection === undefined) return { from: null, to: null }
  return selection instanceof Date ? { from: selection, to: null } : selection
}

/**
 * Show one month as a grid of days and report what is chosen.
 * @param props - the mode, the selection, the month, the week start, the locale, a disabled predicate, and a class name.
 * @returns the element: a caption with the paging buttons above a `role="grid"`.
 */
export function Calendar({ mode = 'single', selected, onSelect, month: controlledMonth, defaultMonth, onMonthChange, showOutsideDays = true, weekStartsOn = 0, locale = 'en-US', disabled, className }: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const range = asRange(selected)
  const [uncontrolledMonth, setUncontrolledMonth] = useState(() => startOfMonth(controlledMonth ?? defaultMonth ?? today))
  const view = startOfMonth(controlledMonth ?? uncontrolledMonth)
  // The roving tab stop: the chosen day while it is on screen, otherwise today if it is, otherwise the first of the month - the same rule upstream uses.
  const [focused, setFocused] = useState<Date>(() => {
    const seed = mode === 'range' ? range.from : selected instanceof Date ? selected : null
    return seed !== null && seed.getMonth() === view.getMonth() && seed.getFullYear() === view.getFullYear() ? startOfDay(seed) : startOfMonth(view)
  })
  const gridRef = useRef<HTMLTableElement | null>(null)
  const labelId = useId()

  const caption = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view), [locale, view])
  const longDay = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), [locale])
  const weekdays = useMemo(() => {
    // 2024-01-07 is a Sunday, so the names follow the week start the caller asked for.
    const sunday = new Date(2024, 0, 7)
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(addDays(sunday, (weekStartsOn + index) % 7)))
  }, [locale, weekStartsOn])

  const weeks = useMemo(() => {
    const first = startOfMonth(view)
    const leading = (first.getDay() - weekStartsOn + 7) % 7
    const start = addDays(first, -leading)
    const cells = Math.ceil((leading + daysInMonth(view)) / 7) * 7
    return Array.from({ length: cells / 7 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)))
  }, [view, weekStartsOn])

  // A key press moves both the state and the real focus. The flag says which, so a click - which moves the state itself - does not steal focus back.
  const focusRequested = useRef(false)
  const goTo = useCallback((next: Date) => {
    focusRequested.current = true
    setFocused(next)
    if (startOfMonth(next).getTime() !== view.getTime()) {
      if (controlledMonth === undefined) setUncontrolledMonth(startOfMonth(next))
      onMonthChange?.(startOfMonth(next))
    }
  }, [controlledMonth, onMonthChange, view])

  // Focus lands after the commit, from the state rather than from a node captured before it: focusing a node captured mid-update is what left the keyboard
  // in the old day (Popover's port learned the same rule with its own panel).
  useEffect(() => {
    if (!focusRequested.current) return
    focusRequested.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(focused)}"]`)?.focus()
  }, [focused])

  const choose = useCallback((date: Date) => {
    if (disabled?.(date) === true) return
    if (mode === 'range') {
      const current = asRange(selected)
      if (current.from === null || current.to !== null) { onSelect?.({ from: startOfDay(date), to: null }); return }
      // A second press closes the range, whichever side of the first day it lands on.
      const from = current.from
      onSelect?.(date.getTime() < from.getTime() ? { from: startOfDay(date), to: from } : { from, to: startOfDay(date) })
      return
    }
    onSelect?.(startOfDay(date))
  }, [disabled, mode, onSelect, selected])

  // A day the predicate disables cannot take focus, so a step that lands on one keeps going: without this the roving tab stop moved to a day whose button
  // refuses focus and the keyboard looked stuck while the state had already moved (found in the browser, on a weekend).
  const enabled = (from: Date, step: number): Date => {
    let candidate = from
    for (let attempt = 0; attempt < 366 && disabled?.(candidate) === true; attempt += 1) candidate = addDays(candidate, step)
    return disabled?.(candidate) === true ? focused : candidate
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>): void => {
    const weekOffset = (focused.getDay() - weekStartsOn + 7) % 7
    const move: Record<string, () => Date> = {
      ArrowLeft: () => enabled(addDays(focused, -1), -1),
      ArrowRight: () => enabled(addDays(focused, 1), 1),
      ArrowUp: () => enabled(addDays(focused, -7), -1),
      ArrowDown: () => enabled(addDays(focused, 7), 1),
      Home: () => enabled(addDays(focused, -weekOffset), 1),
      End: () => enabled(addDays(focused, 6 - weekOffset), -1),
      PageUp: () => enabled(addMonths(focused, -1), -1),
      PageDown: () => enabled(addMonths(focused, 1), 1),
    }
    const next = move[event.key]
    if (next !== undefined) { event.preventDefault(); goTo(startOfDay(next())); return }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(focused) }
  }

  const inRange = (date: Date): boolean => range.from !== null && range.to !== null
    && date.getTime() > Math.min(range.from.getTime(), range.to.getTime())
    && date.getTime() < Math.max(range.from.getTime(), range.to.getTime())

  return (
    <div data-slot="calendar" className={clsx(css.root, className)}>
      <div className={css.nav}>
        <button
          type="button"
          data-slot="calendar-previous"
          aria-label="Go to the previous month"
          className={css.navButton}
          onClick={() => goTo(startOfDay(addMonths(view, -1)))}
        >
          <ChevronIcon direction="left" />
        </button>
        <div id={labelId} aria-live="polite" className={css.caption}>{caption}</div>
        <button
          type="button"
          data-slot="calendar-next"
          aria-label="Go to the next month"
          className={css.navButton}
          onClick={() => goTo(startOfDay(addMonths(view, 1)))}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
      <table ref={gridRef} role="grid" aria-labelledby={labelId} onKeyDown={onKeyDown} className={css.grid}>
        <thead>
          <tr>
            {weekdays.map(name => (
              <th key={name} scope="col" className={css.weekday}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index} className={css.week}>
              {week.map(day => {
                const outside = day.getMonth() !== view.getMonth()
                if (outside && !showOutsideDays) return <td key={dayKey(day)} className={css.empty} />
                const isDisabled = disabled?.(day) === true
                const isSelected = mode === 'range'
                  ? (range.from !== null && sameDay(day, range.from)) || (range.to !== null && sameDay(day, range.to))
                  : selected instanceof Date && sameDay(day, selected)
                const isToday = sameDay(day, today)
                const rangeStart = range.from !== null && sameDay(day, range.from)
                const rangeEnd = range.to !== null && sameDay(day, range.to)
                return (
                  <td
                    key={dayKey(day)}
                    role="gridcell"
                    aria-selected={isSelected}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-outside={outside ? 'true' : 'false'}
                    data-today={isToday ? 'true' : 'false'}
                    data-disabled={isDisabled ? 'true' : 'false'}
                    data-range-start={rangeStart ? 'true' : 'false'}
                    data-range-end={rangeEnd ? 'true' : 'false'}
                    data-range-middle={inRange(day) ? 'true' : 'false'}
                    className={css.cell}
                  >
                    <button
                      type="button"
                      data-day={dayKey(day)}
                      aria-label={longDay.format(day)}
                      disabled={isDisabled}
                      tabIndex={sameDay(day, focused) ? 0 : -1}
                      data-focused={sameDay(day, focused) ? 'true' : 'false'}
                      className={css.day}
                      onClick={() => { focusRequested.current = false; setFocused(startOfDay(day)); choose(day) }}
                    >
                      {day.getDate()}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className={css.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  )
}
