/**
 * A labelled switch with a hint: the app's own Switch primitive plus the hint style of DSH's plugin fields (fields.module.css .hint). Composition only, no new visual. See manifest.yml.
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../fields/fields.module.css'

export interface SwitchFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}

/**
 * Render the switch with its hint.
 * @param props - label, state and hint.
 * @returns the field.
 */
export function SwitchField({ label, checked, onChange, hint }: SwitchFieldProps) {
  return (
    <div className={css.field}>
      <Switch checked={checked} onChange={onChange} label={label} />
      {hint !== undefined && <p className={css.hint}>{hint}</p>}
    </div>
  )
}
