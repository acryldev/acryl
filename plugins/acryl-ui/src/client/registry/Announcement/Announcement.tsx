/**
 * Announcement - a compact, pill-shaped badge-link for top-of-page promotional messages.
 *
 * Inspired by shadcn/ui's Announcement (apps/v4/components/announcement.tsx, MIT, fetched 2026-09-23)
 * and shadcnblocks announcement patterns. Unlike the source, this port does not compose shadcn's
 * own Badge item (self-containment - the ingest gate rejects a cross-item import) - the pill chrome
 * and link behaviour are written here. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode, AnchorHTMLAttributes } from 'react'
import css from './Announcement.module.css'

export interface AnnouncementProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  /** Link target. When provided the announcement renders as an <a>. */
  href?: string
  /** Show a coloured dot indicator (default accent). */
  dot?: boolean
  /** Custom dot colour (any CSS colour value). */
  dotColor?: string
  /** Custom icon element. When provided, replaces the dot. */
  icon?: ReactNode
  /** Announcement text content. */
  children?: ReactNode
  /** Extra class name. */
  className?: string
}

/**
 * Render an announcement badge.
 *
 * Example:
 * ```tsx
 * <Announcement href="/changelog" dot>What's new in v0.1.44</Announcement>
 * <Announcement href="/docs" icon={<SparkleIcon />}>Try the new search</Announcement>
 * <Announcement dot dotColor="#22c55e">All systems operational</Announcement>
 * ```
 */
export function Announcement({
  href,
  dot = false,
  dotColor,
  icon,
  children,
  className,
  ...rest
}: AnnouncementProps) {
  const Tag = href !== undefined ? 'a' : 'span'
  const attrs = href !== undefined
    ? { href, ...rest }
    : { ...rest }

  return (
    <Tag className={clsx(css.announcement, className)} {...attrs}>
      {icon !== undefined && <span className={css.icon}>{icon}</span>}
      {icon === undefined && dot && (
        <span
          className={css.dot}
          style={dotColor !== undefined ? { backgroundColor: dotColor } : undefined}
        />
      )}
      {children}
      {href !== undefined && (
        <span className={css.arrow}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      )}
    </Tag>
  )
}
