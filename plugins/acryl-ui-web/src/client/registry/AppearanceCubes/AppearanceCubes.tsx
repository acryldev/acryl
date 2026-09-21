/**
 * Extracted from DSH: packages/client/ui-theme/src/client/AppearanceRow.tsx (AppearanceRow), pinned deepseek-harness 5dda764ed3.
 * The markup and AppearanceCubes.module.css are the original's; only the slot, store and locale coupling is replaced by plain props
 * (a title, the options with their icon and label, the selected id and a change callback) so any plugin can use the same picker.
 * See manifest.yml for the provenance record.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import css from './AppearanceCubes.module.css'

/** One cube: an id, its label and an optional icon (DSH shows an icon over the label). */
export interface CubeOption {
  id: string
  label: string
  icon?: ReactNode
}

export interface AppearanceCubesProps {
  /** Row title (optional; DSH always shows one). */
  title?: string
  options: readonly CubeOption[]
  /** Selected option id. */
  value: string
  onChange: (id: string) => void
}

/**
 * Render the exclusive tile picker.
 * @param props - options, selection and change callback.
 * @returns the row element tree.
 */
export function AppearanceCubes({ title, options, value, onChange }: AppearanceCubesProps) {
  return (
    <div className={css.group}>
      {title !== undefined && <div className={css.title}>{title}</div>}
      <div className={css.cubeRow}>
        {options.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, value === id && css.selected)}
            aria-pressed={value === id}
            onClick={() => { onChange(id) }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
