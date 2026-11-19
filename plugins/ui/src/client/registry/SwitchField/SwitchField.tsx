/**
 * A labelled switch with a hint: the app's own Switch primitive plus the hint style of DSH's plugin fields (fields.module.css .hint). The DSH primitive Switch carries its label only as an accessible name, so the visible label uses the fields' own head/label styles. Composition only, no new visual. Its stylesheet is a self-contained copy of the four fields.module.css rules it uses (field, head, label, hint), so this item has no cross-item dependency when consumed on its own. See manifest.yml.
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SwitchField.module.css'

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
      <div className={css.head}>
        <span className={css.label}>{label}</span>
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
      {hint !== undefined && <p className={css.hint}>{hint}</p>}
    </div>
  )
}
