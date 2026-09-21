/**
 * Extracted from DSH: the selector of packages/client/ui-permission-presets/src/client/PermissionRow.tsx (a pill button that opens the app's Menu), pinned deepseek-harness 5dda764ed3.
 * Markup and SelectPill.module.css are the original's; the preset store and the risk confirmation stay in the feature. See manifest.yml.
 */
import { useState } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SelectPill.module.css'

export interface SelectOption {
  id: string
  label: string
  disabled?: boolean
}

export interface SelectPillProps {
  options: readonly SelectOption[]
  /** Selected option id. */
  value: string
  onChange: (id: string) => void
  /** Text shown when no option matches the value. */
  placeholder?: string
  disabled?: boolean
  /** Accessible name of the trigger. */
  label?: string
}

/**
 * Render the dropdown selector.
 * @param props - options, selection and change callback.
 * @returns the selector with its menu.
 */
export function SelectPill({ options, value, onChange, placeholder = '', disabled = false, label }: SelectPillProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value)
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={options.map(option => ({ id: option.id, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))}
      selectedId={value}
      onSelect={(id) => { setOpen(false); if (id !== value) onChange(id) }}
      align="end"
      portal
      anchor={(
        <button
          type="button"
          className={css.selector}
          aria-haspopup="menu"
          aria-expanded={open}
          {...label === undefined ? {} : { 'aria-label': label }}
          disabled={disabled || options.length === 0}
          onClick={() => { setOpen(current => !current) }}
        >
          {selected?.label ?? placeholder}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}
