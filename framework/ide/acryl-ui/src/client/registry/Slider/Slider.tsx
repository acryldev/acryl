/**
 * Ported from shadcn/ui's Slider (https://ui.shadcn.com/docs/components/slider, MIT licence, registry item `slider`, style new-york-v4, fetched 2026-09-22).
 * Radix's Slider is dropped and the behaviour is written here, because a slider is arithmetic plus two input paths: each thumb is a `role="slider"` element
 * with `aria-valuemin`/`max`/`now`/`orientation`, moved by arrow keys (one `step`), PageUp/PageDown (ten), Home/End (the ends), and by dragging - a pointer
 * captured on the thumb, with the value computed from the track's own rect and clamped against its neighbour so the thumbs cannot cross. A press on the
 * track moves the nearest thumb, which is what Radix does.
 *
 * The one-value-per-thumb shape is kept: `value`/`defaultValue` take a number or an array, and the range fill spans from the lowest value to the highest.
 * The source's `bg-white` thumb face becomes the app's `--dsw-alias-bg-layer-1` surface, since a literal white would not follow the scheme; the source's
 * `ring-ring/50` hover and focus rings become the app's interactive surface. See manifest.yml.
 */
import { useCallback, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import css from './Slider.module.css'

export type SliderOrientation = 'horizontal' | 'vertical'

export interface SliderProps {
  value?: number | number[]
  defaultValue?: number | number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  orientation?: SliderOrientation
  label?: string
  onValueChange?: (value: number[]) => void
  className?: string
}

const toArray = (input: number | number[] | undefined, fallback: number[]): number[] =>
  Array.isArray(input) ? input : input === undefined ? fallback : [input]

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high)

/**
 * Render a slider: one thumb per value, draggable and operable from the keyboard.
 * @param props - the value(s) (controlled or with a default), the range, the step, the orientation, and a label for the thumbs.
 * @returns the element.
 */
export function Slider({ value, defaultValue, min = 0, max = 100, step = 1, disabled = false, orientation = 'horizontal', label, onValueChange, className }: SliderProps) {
  const [uncontrolled, setUncontrolled] = useState<number[]>(() => toArray(defaultValue, [min, max]))
  const values = toArray(value, uncontrolled)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const setValues = useCallback((next: number[]): void => {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }, [value, onValueChange])

  const commit = (index: number, raw: number): void => {
    const lower = index === 0 ? min : values[index - 1] ?? min
    const upper = index === values.length - 1 ? max : values[index + 1] ?? max
    const snapped = clamp(Math.round((raw - min) / step) * step + min, min, max)
    setValues(values.map((current, at) => at === index ? clamp(snapped, lower, upper) : current))
  }

  const valueFromPointer = (event: ReactPointerEvent, element: HTMLElement): number => {
    const rect = element.getBoundingClientRect()
    const ratio = orientation === 'vertical'
      ? 1 - (event.clientY - rect.top) / rect.height
      : (event.clientX - rect.left) / rect.width
    return min + clamp(ratio, 0, 1) * (max - min)
  }

  const percent = (input: number): number => max === min ? 0 : ((input - min) / (max - min)) * 100
  const lowest = Math.min(...values)
  const highest = Math.max(...values)
  const rangeStyle: CSSProperties = orientation === 'vertical'
    ? { bottom: `${percent(lowest)}%`, height: `${percent(highest) - percent(lowest)}%` }
    : { left: `${percent(lowest)}%`, width: `${percent(highest) - percent(lowest)}%` }

  return (
    <div
      data-slot="slider"
      data-orientation={orientation}
      data-disabled={disabled}
      className={clsx(css.slider, className)}
    >
      <div
        ref={trackRef}
        data-slot="slider-track"
        className={css.track}
        onPointerDown={event => {
          if (disabled) return
          const track = trackRef.current
          if (track === null) return
          const target = valueFromPointer(event, track)
          let nearest = 0
          for (let index = 1; index < values.length; index += 1) {
            if (Math.abs((values[index] ?? 0) - target) < Math.abs((values[nearest] ?? 0) - target)) nearest = index
          }
          commit(nearest, target)
        }}
      >
        <div data-slot="slider-range" className={css.range} style={rangeStyle} />
      </div>
      {values.map((current, index) => (
        <div
          key={index}
          data-slot="slider-thumb"
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-orientation={orientation}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
          aria-disabled={disabled}
          className={css.thumb}
          style={orientation === 'vertical' ? { bottom: `${percent(current)}%` } : { left: `${percent(current)}%` }}
          onKeyDown={event => {
            if (disabled) return
            const big = step * 10
            const moves: Record<string, number | undefined> = {
              ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step,
              PageUp: big, PageDown: -big, Home: min - (current ?? 0), End: max - (current ?? 0),
            }
            const delta = moves[event.key]
            if (delta === undefined) return
            event.preventDefault()
            commit(index, current + delta)
          }}
          onPointerDown={event => {
            if (disabled) return
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return
            const track = trackRef.current
            if (track === null) return
            commit(index, valueFromPointer(event, track))
          }}
          onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId) }}
        />
      ))}
    </div>
  )
}