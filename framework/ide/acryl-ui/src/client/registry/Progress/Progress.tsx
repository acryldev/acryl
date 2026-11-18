/**
 * Ported from shadcn/ui's Progress (https://ui.shadcn.com/docs/components/progress, MIT licence, registry item `progress`, style new-york-v4, fetched
 * 2026-09-22). The Radix `Progress.Root`/`Indicator` primitives it wraps are dropped - a determinate progress bar needs no interactive behavior, only the
 * ARIA attributes Radix itself would apply - so this sets them directly on a plain track/fill pair. See manifest.yml.
 */
import css from './Progress.module.css'

export interface ProgressProps {
  /** 0 to 100. */
  value: number
  className?: string
}

/**
 * Render a determinate progress bar.
 * @param props - the current value (0-100) and an extra class.
 * @returns the element.
 */
export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} className={className ?? css.track}>
      <div className={css.fill} style={{ transform: `translateX(-${100 - clamped}%)` }} />
    </div>
  )
}
