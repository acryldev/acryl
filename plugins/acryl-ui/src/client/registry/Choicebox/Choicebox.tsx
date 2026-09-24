/**
 * Choicebox — a card-style selectable option with radio/checkbox semantics.
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Choicebox.module.css'

export interface ChoiceboxProps {
  /** Whether this option is selected. */
  selected?: boolean
  /** Whether this option is disabled. */
  disabled?: boolean
  /** Called when the user clicks/taps this option. */
  onClick?: () => void
  /** Title text. */
  title: ReactNode
  /** Optional description. */
  description?: ReactNode
  /** Optional icon shown above the title. */
  icon?: ReactNode
  /** Extra class name. */
  className?: string
}

/**
 * A card-style selectable option.
 */
export function Choicebox({ selected, disabled, onClick, title, description, icon, className }: ChoiceboxProps) {
  return (
    <button
      type="button"
      className={clsx(css.choicebox, selected && css['choicebox--selected'], disabled && css['choicebox--disabled'], className)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
    >
      {icon !== undefined && <span className={css.icon}>{icon}</span>}
      <span className={css.title}>{title}</span>
      {description !== undefined && <span className={css.description}>{description}</span>}
    </button>
  )
}
