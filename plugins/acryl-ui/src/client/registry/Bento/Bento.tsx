/**
 * Bento — a bento-grid layout of styled tiles with configurable spans.
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import css from './Bento.module.css'

export interface BentoItem {
  /** Unique id. */
  id: string
  /** Tile content. */
  children: ReactNode
  /** Number of columns this tile spans. */
  colSpan?: 1 | 2 | 3
  /** Number of rows this tile spans. */
  rowSpan?: 1 | 2
  /** Visual variant. */
  variant?: 'default' | 'accent' | 'subtle'
}

export interface BentoProps {
  /** Tiles to display. */
  items: BentoItem[]
  /** Number of columns in the grid. */
  columns?: 2 | 3 | 4
  /** Extra class name. */
  className?: string
}

/**
 * A bento-grid layout.
 */
export function Bento({ items, columns = 3, className }: BentoProps) {
  return (
    <div
      className={clsx(css.grid, css[`columns--${columns}`], className)}
    >
      {items.map(item => (
        <div
          key={item.id}
          className={clsx(
            css.tile,
            item.colSpan && css[`col-span--${item.colSpan}`],
            item.rowSpan && css[`row-span--${item.rowSpan}`],
            item.variant && css[`variant--${item.variant}`],
          )}
        >
          {item.children}
        </div>
      ))}
    </div>
  )
}
