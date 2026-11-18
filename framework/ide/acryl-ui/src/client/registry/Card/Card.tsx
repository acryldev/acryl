/**
 * Card surface: the border, radius and layered background of DSH's plugin card (packages/client/ui-settings-plugins/src/client/PluginCard.module.css, pinned deepseek-harness 5dda764ed3)
 * around a title and content. The disclosure behaviour of PluginCard itself stays in that feature. See manifest.yml.
 */
import { useId } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Card.module.css'

export interface CardProps {
  title?: string
  /** Actions, right-aligned under the content. */
  footer?: ReactNode
  children?: ReactNode
}

/**
 * Render the card.
 * @param props - title, content and footer actions.
 * @returns the card element.
 */
export function Card({ title, footer, children }: CardProps) {
  const titleId = useId()
  return (
    <section className={clsx(css.card, css.body)} role="group" {...title === undefined ? {} : { 'aria-labelledby': titleId }}>
      {title !== undefined && <h3 id={titleId} className={css.title}>{title}</h3>}
      {children}
      {footer !== undefined && <div className={css.footer}>{footer}</div>}
    </section>
  )
}
