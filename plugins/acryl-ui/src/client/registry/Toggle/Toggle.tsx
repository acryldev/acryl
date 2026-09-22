/**
 * Ported from shadcn/ui's Toggle (https://ui.shadcn.com/docs/components/toggle, MIT licence, registry item `toggle`, style new-york-v4, fetched
 * 2026-09-22). The Radix `Toggle.Root` primitive it wraps is dropped - a two-state pressed button needs no interactive behavior beyond a native
 * `<button aria-pressed>`, which this already has; cva's variant classes replaced by a CSS Module. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Toggle.module.css'

export type ToggleVariant = 'default' | 'outline'
export type ToggleSize = 'sm' | 'default' | 'lg'

export interface ToggleProps {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children?: ReactNode
  variant?: ToggleVariant
  size?: ToggleSize
  disabled?: boolean
  className?: string
}

/**
 * Render a two-state toggle button.
 * @param props - pressed state, change handler, content, variant and size.
 * @returns the element.
 */
export function Toggle({ pressed, onPressedChange, children, variant = 'default', size = 'default', disabled = false, className }: ToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => { onPressedChange(!pressed) }}
      className={clsx(css.toggle, css[variant], css[size], pressed && css.pressed, className)}
    >
      {children}
    </button>
  )
}
