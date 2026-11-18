/**
 * Ported from shadcn/ui's Skeleton (https://ui.shadcn.com/docs/components/skeleton, MIT licence, registry item `skeleton`, style new-york-v4, fetched 2026-09-22).
 * Tailwind's `animate-pulse` and `bg-accent` replaced by a CSS Module keyframe on the app's own token. See manifest.yml.
 */
import clsx from 'clsx'
import css from './Skeleton.module.css'

export interface SkeletonProps {
  className?: string
  /** Inline width/height for this instance (a skeleton has no natural size of its own). */
  style?: { width?: string | number, height?: string | number }
}

/**
 * Render a pulsing placeholder shape.
 * @param props - an extra class and inline size.
 * @returns the element.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={clsx(css.skeleton, className)} style={style} />
}
