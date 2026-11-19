/**
 * Ported from shadcn/ui's Spinner (https://ui.shadcn.com/docs/components/spinner, MIT licence, registry item `spinner`, style new-york-v4, fetched 2026-09-22).
 * The original renders lucide-react's Loader2Icon; that dependency is dropped in favor of a plain inline SVG arc with the same rotation, so this library
 * adds no new runtime dependency. See manifest.yml.
 */
import clsx from 'clsx'
import css from './Spinner.module.css'

export interface SpinnerProps {
  className?: string
}

/**
 * Render a rotating loading indicator.
 * @param props - an extra class.
 * @returns the element.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <svg role="status" aria-label="Loading" viewBox="0 0 24 24" fill="none" className={clsx(css.spinner, className)}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
