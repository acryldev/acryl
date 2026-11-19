/**
 * Extracted from DSH: the row layout of packages/client/ui-permission-presets/src/client/PermissionRow.tsx (title, description, control), pinned deepseek-harness 5dda764ed3.
 * Markup and SettingsRow.module.css are the original's. The DSH row also owns a host-backed preference and a risk confirmation; those stay in the feature, this is only
 * the layout so any settings-style screen can reuse it. See manifest.yml.
 */
import type { ReactNode } from 'react'
import css from './SettingsRow.module.css'

export interface SettingsRowProps {
  title: string
  description?: string
  /** True when the description is an error message (announced to assistive technology). */
  error?: boolean
  /** The control on the right (a SelectPill, a Switch, a button). */
  children?: ReactNode
}

/**
 * Render a settings row.
 * @param props - copy and the control.
 * @returns the row element tree.
 */
export function SettingsRow({ title, description, error = false, children }: SettingsRowProps) {
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{title}</div>
        {description !== undefined && <div className={css.desc} role={error ? 'alert' : undefined}>{description}</div>}
      </div>
      {children}
    </div>
  )
}
