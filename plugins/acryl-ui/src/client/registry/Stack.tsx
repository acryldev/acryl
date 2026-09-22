/**
 * Stack: a flex container with a theme-consistent gap. Layout only; direction, gap and alignment are runtime props, which is what the DSH styling rules allow inline styles for
 * (doc section 23/39). Not an extraction (DSH lays out with per-feature CSS); origin: gap. See manifest.yml.
 */
import type { CSSProperties, ReactNode } from 'react'

const GAPS = { xs: 4, sm: 8, md: 12, lg: 20 } as const
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const

export interface StackProps {
  direction?: 'column' | 'row'
  gap?: keyof typeof GAPS
  align?: keyof typeof ALIGN
  children?: ReactNode
}

/**
 * Render the container.
 * @param props - direction, gap and alignment.
 * @returns the flex container.
 */
export function Stack({ direction = 'column', gap = 'md', align = 'stretch', children }: StackProps) {
  const style: CSSProperties = { display: 'flex', flexDirection: direction, gap: GAPS[gap], alignItems: ALIGN[align] }
  return <div style={style}>{children}</div>
}
