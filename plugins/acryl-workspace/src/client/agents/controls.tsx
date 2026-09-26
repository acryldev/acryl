/** Small controls shared by the Agents settings rows. */

export interface SegmentedProps {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly id: string; readonly label: string }[]
  onChange(id: string): void
}

/** A two-or-three way switch drawn as joined buttons; exactly one is checked. */
export function Segmented({ label, value, options, onChange }: SegmentedProps) {
  return (
    <div className="dshAgentsSegmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button key={option.id} type="button" role="radio" aria-checked={option.id === value} onClick={() => { if (option.id !== value) onChange(option.id) }}>{option.label}</button>
      ))}
    </div>
  )
}

export function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M6.5 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    </svg>
  )
}
