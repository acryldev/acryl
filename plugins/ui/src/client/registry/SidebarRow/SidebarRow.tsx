/**
 * Extracted from DSH: the New Session bar of packages/client/ui-sidebar/src/client/SidebarRoot.tsx (icon and label in the wide sidebar, a plain icon control with a tooltip on the
 * 56px rail), pinned deepseek-harness 5dda764ed3. Markup and SidebarRow.module.css are the original's rules for it; the one adaptation is that the rail form is driven by the button's
 * own `collapsed` class instead of an ancestor's (the original styles `.collapsed .newSession`). See manifest.yml.
 */
import type { ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import css from './SidebarRow.module.css'

export interface SidebarRowProps {
  icon: ReactNode
  label: string
  /** True for the wide sidebar (icon and label); false for the rail (icon only, label as tooltip and accessible name). */
  wide: boolean
  onClick: () => void
}

/**
 * Render the row.
 * @param props - icon, label, width state and action.
 * @returns the row button (with its tooltip on the rail).
 */
export function SidebarRow({ icon, label, wide, onClick }: SidebarRowProps) {
  return (
    <Tooltip label={label} delayMs={500} disabled={wide}>
      <button type="button" className={clsx(css.newSession, !wide && css.collapsed)} aria-label={label} onClick={onClick}>
        {icon}
        {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{label}</span>}
      </button>
    </Tooltip>
  )
}
