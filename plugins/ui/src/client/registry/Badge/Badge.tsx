/**
 * Ported from shadcn/ui's Badge (https://ui.shadcn.com/docs/components/badge, MIT licence, registry item `badge`, style new-york-v4, fetched 2026-09-22).
 * Tailwind's cva variant classes replaced by a CSS Module on the app's own tokens; `asChild`/Slot (a Radix dependency) dropped - render an <a> yourself and
 * style it with the returned class if you need a link badge. Variants renamed to this library's own roles (success/warning/error/info exist; shadcn's
 * generic "destructive"/"secondary" do not) rather than kept as shadcn's names. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Badge.module.css'

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error'

export interface BadgeProps {
  children?: ReactNode
  variant?: BadgeVariant
  className?: string
}

/**
 * Render one badge.
 * @param props - content, variant and an optional extra class.
 * @returns the element.
 */
export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return <span className={clsx(css.badge, css[variant], className)}>{children}</span>
}
