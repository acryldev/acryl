/**
 * Ported from shadcn/ui's RadioGroup (https://ui.shadcn.com/docs/components/radio-group, MIT licence, registry item `radio-group`, style new-york-v4,
 * fetched 2026-09-22). A real gap-fill, not a duplicate of this library's `AppearanceCubes`/`Segmented`: those are icon-and-label exclusive TILES (the
 * app's own Appearance picker pattern); this is the classic radio-dot list, for when the options are plain text and tiles would be overkill. The Radix
 * `RadioGroup.Root`/`Item`/`Indicator` primitives it wraps are dropped in favor of real `<input type="radio">` controls (grouped by `name`, which gives
 * the native arrow-key behavior for free); lucide-react's CircleIcon replaced by a plain CSS dot. See manifest.yml.
 */
import clsx from 'clsx'
import css from './RadioGroup.module.css'

export interface RadioOption {
  id: string
  label: string
  disabled?: boolean
}

export interface RadioGroupProps {
  name: string
  options: readonly RadioOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Render a list of mutually exclusive radio options.
 * @param props - the input group name, options, value and change handler.
 * @returns the element.
 */
export function RadioGroup({ name, options, value, onChange, className }: RadioGroupProps) {
  return (
    <div role="radiogroup" className={clsx(css.group, className)}>
      {options.map(option => (
        <label key={option.id} className={css.option} data-disabled={option.disabled || undefined}>
          <span className={css.dot} data-checked={option.id === value || undefined}>
            <input type="radio" name={name} value={option.id} checked={option.id === value} disabled={option.disabled} onChange={() => { onChange(option.id) }} className={css.input} />
          </span>
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  )
}
