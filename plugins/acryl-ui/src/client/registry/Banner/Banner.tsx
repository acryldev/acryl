/**
 * Banner - a full-width dismissible horizontal strip for product announcements.
 *
 * Inspired by shadcnblocks Banner1 design: full viewport width, hairline border,
 * centred inline text with a title, description and optional link, and a dismiss
 * button at the end. When closed, the banner returns null (local state).
 * See manifest.yml.
 */
import clsx from 'clsx'
import { useCallback, useState, type ReactNode } from 'react'
import css from './Banner.module.css'

export interface BannerProps {
  /** Semibold title text. */
  title?: ReactNode
  /** Muted descriptive text. */
  description?: ReactNode
  /** Label for the inline link. */
  linkLabel?: string
  /** URL for the inline link (opens in a new tab when set). */
  linkHref?: string
  /** Whether the banner is visible by default. */
  defaultVisible?: boolean
  /** Called when the banner is dismissed. */
  onDismiss?: () => void
  /** Extra class name. */
  className?: string
}

/**
 * Render a dismissible announcement banner.
 *
 * Example:
 * ```tsx
 * <Banner
 *   title="New"
 *   description="We've added Nix flake support"
 *   linkLabel="Learn more"
 *   linkHref="/docs/nix"
 * />
 * ```
 */
export function Banner({
  title,
  description,
  linkLabel,
  linkHref,
  defaultVisible = true,
  onDismiss,
  className,
}: BannerProps) {
  const [visible, setVisible] = useState(defaultVisible)

  const handleDismiss = useCallback(() => {
    setVisible(false)
    onDismiss?.()
  }, [onDismiss])

  if (!visible) return null

  return (
    <div className={clsx(css.banner, className)} role="banner" aria-label="announcement">
      <div className={css.body}>
        {title !== undefined && <span className={css.title}>{title}</span>}
        {description !== undefined && <span className={css.description}>{description}</span>}
        {linkLabel !== undefined && linkHref !== undefined && (
          <a className={css.link} href={linkHref} target="_blank" rel="noopener noreferrer">
            {linkLabel}
          </a>
        )}
        {linkLabel !== undefined && linkHref === undefined && (
          <span className={css.link}>{linkLabel}</span>
        )}
      </div>
      <button className={css.dismiss} onClick={handleDismiss} aria-label="Dismiss" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  )
}
