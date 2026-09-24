/**
 * Rating — a star rating component with interactive or read-only mode.
 * Self-contained; no cross-item imports. Uses inline SVG star icons.
 * Built on ACRYL's --dsw-alias-* tokens. See manifest.yml.
 */
import clsx from 'clsx'
import css from './Rating.module.css'

export interface RatingProps {
  /** Current rating value (0 to max). */
  value: number
  /** Maximum number of stars. */
  max?: number
  /** Called when the user clicks a star. When omitted, the rating is read-only. */
  onChange?: (value: number) => void
  /** Size. */
  size?: 'sm' | 'default' | 'lg'
  /** Extra class name. */
  className?: string
}

/** An inline SVG star icon (filled or unfilled). */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

/**
 * A star rating with optional interactivity.
 */
export function Rating({ value, max = 5, onChange, size = 'default', className }: RatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)

  return (
    <span className={clsx(css.rating, css[`size--${size}`], className)} role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of ${max} stars`}>
      {stars.map(star => {
        const filled = star <= value
        return (
          <span
            key={star}
            className={clsx(css.star, filled && css['star--filled'])}
            role={onChange ? 'radio' : undefined}
            aria-checked={onChange ? filled : undefined}
            aria-label={onChange ? `${star} star${star > 1 ? 's' : ''}` : undefined}
            tabIndex={onChange ? 0 : undefined}
            onKeyDown={onChange ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(star) } } : undefined}
            onClick={onChange ? () => { onChange(star) } : undefined}
          >
            <StarIcon filled={filled} />
          </span>
        )
      })}
    </span>
  )
}
