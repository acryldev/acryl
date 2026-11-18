/**
 * Ported from shadcn/ui's Checkbox (https://ui.shadcn.com/docs/components/checkbox, MIT licence, registry item `checkbox`, style new-york-v4, fetched
 * 2026-09-22). The Radix `Checkbox.Root`/`Indicator` primitives it wraps are dropped in favor of a real `<input type="checkbox">` (a native control needs
 * no Radix to be accessible); lucide-react's CheckIcon is replaced by a plain inline SVG check (no new dependency). See manifest.yml.
 */
import clsx from 'clsx'
import css from './Checkbox.module.css'

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

/**
 * Render a checkbox with its accessible label.
 * @param props - checked state, change handler, label and disabled flag.
 * @returns the element.
 */
export function Checkbox({ checked, onChange, label, disabled = false, className }: CheckboxProps) {
  return (
    <label className={clsx(css.wrapper, className)}>
      <span className={css.box} data-checked={checked || undefined}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => { onChange(event.target.checked) }} className={css.input} aria-label={label} />
        {checked && <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden><path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span>{label}</span>
    </label>
  )
}
