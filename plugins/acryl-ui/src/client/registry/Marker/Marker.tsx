/**
 * Ported from shadcn/ui's Marker (https://ui.shadcn.com/docs/components/marker, MIT licence, registry item `marker`, style new-york-v4, fetched
 * 2026-09-22). A muted label line for between message groups: plain, ruled on both sides, or underlined at the bottom. Tailwind utility classes
 * replaced by a CSS Module on the app's own tokens; `cva`'s variants become classes; `asChild`/Slot (a Radix dependency) dropped from `Marker`;
 * the source's `group-data-[variant=separator]` rule on the content becomes the `.separator .content` descendant selector. `markerVariants` is not
 * exported - the source exported its `cva` result, and this port has no `cva`. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Marker.module.css'

export type MarkerVariant = 'default' | 'separator' | 'border'

export interface MarkerProps {
  variant?: MarkerVariant
  children?: ReactNode
  className?: string
}

/**
 * Render a muted label line.
 * @param props - the variant (a plain line, a line ruled on both sides, or one underlined at the bottom) and the line's content.
 * @returns the element.
 */
export function Marker({ variant = 'default', children, className }: MarkerProps) {
  return (
    <div
      data-variant={variant}
      className={clsx(css.marker, variant === 'separator' ? css.separator : variant === 'border' ? css.border : undefined, className)}
    >
      {children}
    </div>
  )
}

export function MarkerIcon({ children, className }: { children?: ReactNode, className?: string }) {
  return <span aria-hidden="true" className={clsx(css.icon, className)}>{children}</span>
}

export function MarkerContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <span className={clsx(css.content, className)}>{children}</span>
}