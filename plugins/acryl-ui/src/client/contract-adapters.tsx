/**
 * The contract names of the cross-surface UI contract (plugins/acryl-ui/contracts/components.json) as thin adapters over the extracted DSH components: same behavior and
 * markup, the contract's simpler props. Kept separate from registry/ so the extracted files stay as close to DSH's originals as possible.
 */
import { useId } from 'react'
import { AppearanceCubes, type CubeOption } from './registry/AppearanceCubes/AppearanceCubes.tsx'
import { ValueField } from './registry/fields/fields.tsx'
import { SelectPill, type SelectOption } from './registry/SelectPill/SelectPill.tsx'
import { SettingsRow as SettingsRowLayout } from './registry/SettingsRow/SettingsRow.tsx'
import type { ReactNode } from 'react'

/** Contract `Field`: a labelled text input with a hint, or an error in place of the hint (DSH `ValueField`). `onChange` receives the string. */
export function Field({ label, value, onChange, hint, error, placeholder }: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <ValueField
      id={id}
      label={label}
      hint={hint ?? ''}
      text={value}
      overridden={false}
      invalid={error !== undefined}
      overriddenLabel=""
      resetLabel=""
      invalidLabel={error ?? ''}
      disabled={false}
      onEdit={onChange}
      onReset={() => {}}
      {...placeholder === undefined ? {} : { placeholder }}
    />
  )
}

/** Contract `Segmented`: exclusive tiles (DSH `AppearanceRow`'s cubes). It is a full-width row with its own `title` above the tiles, as in DSH; `label` is the accessible name of the group. */
export function Segmented({ label, title, options, value, onChange }: { label?: string, title?: string, options: readonly CubeOption[], value: string, onChange: (id: string) => void }) {
  return (
    <div role="group" {...label === undefined ? (title === undefined ? {} : { 'aria-label': title }) : { 'aria-label': label }}>
      <AppearanceCubes {...title === undefined ? {} : { title }} options={options} value={value} onChange={onChange} />
    </div>
  )
}

/** Contract `SelectField`: the dropdown selector (DSH `PermissionRow`'s pill over the app's Menu). */
export function SelectField(props: { options: readonly SelectOption[], value: string, onChange: (id: string) => void, placeholder?: string, label?: string }) {
  return <SelectPill {...props} />
}

/** Contract `SettingsRow`: `label` and `description` on the left, the control as children (DSH row layout; `title` there). `focused` is terminal-only and ignored on the web. */
export function SettingsRow({ label, description, children }: { label: string, description?: string, focused?: boolean, children?: ReactNode }) {
  return <SettingsRowLayout title={label} {...description === undefined ? {} : { description }}>{children}</SettingsRowLayout>
}
