/**
 * Empty state. DSH has no such component (its Plugins section renders a bare `<p className={css.empty}>`), so this is the one part of the registry that is not an extraction:
 * a title and description over that same `.empty` text style. See manifest.yml (origin: gap).
 */
import type { ReactNode } from 'react'
import css from './EmptyState.module.css'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

/**
 * Render the empty message.
 * @param props - title, description and an optional action.
 * @returns the message block.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={css.root}>
      <h3 className={css.title}>{title}</h3>
      {description !== undefined && <p className={css.empty}>{description}</p>}
      {action}
    </div>
  )
}
