/**
 * Status — a colored dot indicator for status/state (online, offline, busy, away, etc.).
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Status.module.css'

export interface StatusProps {
  /** The status variant. */
  variant?: 'online' | 'offline' | 'busy' | 'away' | 'warning' | 'error'
  /** Optional label shown beside the dot. */
  children?: ReactNode
  /** Size. */
  size?: 'sm' | 'default' | 'lg'
  /** Extra class name. */
  className?: string
}

const variantClass: Record<string, string | undefined> = {
  online: css['status--online'],
  offline: css['status--offline'],
  busy: css['status--busy'],
  away: css['status--away'],
  warning: css['status--warning'],
  error: css['status--error'],
}

/**
 * A colored dot status indicator with optional label.
 */
export function Status({ variant = 'online', children, size = 'default', className }: StatusProps) {
  return (
    <span className={clsx(css.status, css[`size--${size}`], className)}>
      <span className={clsx(css.dot, variantClass[variant] ?? '')} aria-hidden />
      {children !== undefined && <span className={css.label}>{children}</span>}
    </span>
  )
}
