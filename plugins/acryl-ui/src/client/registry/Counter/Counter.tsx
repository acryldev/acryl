/**
 * Counter — a numeric badge/display for counts, steps, and notification numbers.
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import clsx from 'clsx'
import css from './Counter.module.css'

export interface CounterProps {
  /** The numeric value to display. */
  value: number
  /** Maximum value before showing "+N" (e.g. max=99 → "+99"). */
  max?: number
  /** Visual variant. */
  variant?: 'default' | 'primary' | 'danger'
  /** Size. */
  size?: 'sm' | 'default'
  /** Extra class name. */
  className?: string
}

/**
 * A numeric badge/display.
 */
export function Counter({ value, max, variant = 'default', size = 'default', className }: CounterProps) {
  const display = max !== undefined && value > max ? `+${max}` : String(value)
  return (
    <span className={clsx(css.counter, css[`variant--${variant}`], css[`size--${size}`], className)}>
      {display}
    </span>
  )
}
