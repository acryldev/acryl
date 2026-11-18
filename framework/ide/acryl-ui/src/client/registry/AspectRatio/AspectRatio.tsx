/**
 * Ported from shadcn/ui's AspectRatio (https://ui.shadcn.com/docs/components/aspect-ratio, MIT licence, registry item `aspect-ratio`, style new-york-v4,
 * fetched 2026-09-22). The Radix `AspectRatio.Root` primitive it wraps is dropped - it is a pure CSS box (a fixed ratio between width and height), which
 * the CSS `aspect-ratio` property now does natively with no JS behavior needed at all. See manifest.yml.
 */
import type { ReactNode } from 'react'
import css from './AspectRatio.module.css'

export interface AspectRatioProps {
  /** Width divided by height, e.g. `16 / 9`. */
  ratio: number
  children?: ReactNode
  className?: string
}

/**
 * Render a box held to a fixed width:height ratio.
 * @param props - the ratio and content.
 * @returns the element.
 */
export function AspectRatio({ ratio, children, className }: AspectRatioProps) {
  return <div className={className ?? css.box} style={{ aspectRatio: ratio }}>{children}</div>
}
