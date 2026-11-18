/**
 * Ported from shadcn/ui's Separator (https://ui.shadcn.com/docs/components/separator, MIT licence, registry item `separator`, style new-york-v4, fetched
 * 2026-09-22). The Radix `Separator.Root` primitive it wraps is dropped - a decorative separator needs no interactive behavior, only the ARIA presentation
 * role Radix itself would apply - so this is a plain <div>. See manifest.yml.
 */
import clsx from 'clsx'
import css from './Separator.module.css'

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  /** True (the default): a layout divider, hidden from assistive tech. False: a real semantic separator (`role="separator"`). */
  decorative?: boolean
  className?: string
}

/**
 * Render a thin dividing line.
 * @param props - orientation, decorative flag and an extra class.
 * @returns the element.
 */
export function Separator({ orientation = 'horizontal', decorative = true, className }: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={clsx(css.separator, orientation === 'vertical' ? css.vertical : css.horizontal, className)}
    />
  )
}
