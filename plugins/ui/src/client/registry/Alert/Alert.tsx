/**
 * Ported from shadcn/ui's Alert (https://ui.shadcn.com/docs/components/alert, MIT licence, registry item `alert`, style new-york-v4, fetched 2026-09-22).
 * cva's variant classes replaced by a CSS Module on the app's own tokens; the grid layout (icon column keyed by `has-[>svg]`) is kept as a plain flex row -
 * that Tailwind arbitrary-variant trick has no equivalent worth reproducing outside Tailwind, so an icon is just the first child. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Alert.module.css'

export type AlertVariant = 'default' | 'error'

export interface AlertProps {
  /** An icon, rendered before the title/description. */
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  variant?: AlertVariant
  className?: string
}

/**
 * Render an alert.
 * @param props - icon, title, body and variant.
 * @returns the element.
 */
export function Alert({ icon, title, children, variant = 'default', className }: AlertProps) {
  return (
    <div role="alert" className={clsx(css.alert, css[variant], className)}>
      {icon !== undefined && <span className={css.icon}>{icon}</span>}
      <div className={css.body}>
        {title !== undefined && <div className={css.title}>{title}</div>}
        {children !== undefined && <div className={css.description}>{children}</div>}
      </div>
    </div>
  )
}
