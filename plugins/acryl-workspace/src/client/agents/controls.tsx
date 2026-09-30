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

/** A small chevron that points down, or up when `open`. */
export function ChevronIcon({ open }: { readonly open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={open ? 'M2.5 7.5L6 4l3.5 3.5' : 'M2.5 4.5L6 8l3.5-3.5'} />
    </svg>
  )
}

/** AcrylDSH Chat's own mark, distinct from any agent runtime's icon (spec 040 T130) - a chat bubble. */
export function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 12 11H6.7L4 13.2V11H4a1.5 1.5 0 0 1-1.5-1.5v-5Z" />
    </svg>
  )
}

/** A workspace's own mark when it is a git repository, distinct from a plain folder's (T134-followup). */
export function GitRepoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1.5" />
      <circle cx="5" cy="12.5" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <path d="M5 5v6M5 6.5A4 4 0 0 0 9.5 8" />
    </svg>
  )
}

/** A workspace's own mark when it is a plain folder, not a git repository (T134-followup). */
export function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1 1 0 0 1 3 3.5h3l1.3 1.7H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" />
    </svg>
  )
}

/**
 * A small, self-owned ACRYL monogram for the tree's own header (T137-followup: "there used to be...
 * ACRYL logo, it's gone"). Deliberately not the real pixel brand mark from `dsh-client-ui-brand-acryl` -
 * that package's client entry is a Cordis-loader-format bundle (`window.__ModuleLoader__.load(...)`),
 * built to be consumed only through the sidebar's own brand-mark slot, not importable as a plain React
 * component; reaching around that would mean duplicating its (large, binary) logo data into this package
 * too. A lightweight mark of our own here, not a copy of that asset.
 */
export function AcrylMarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2 3 13h2.2L6.4 10h3.2l1.2 3H13L8 2Zm0 3.4L9.4 8.6H6.6L8 5.4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Two-pane "collapse sidebar" mark (T137-followup: the tree's own header needed a real collapse
 * control, matching what the upstream sidebar chrome used to show when it was the default view). */
export function CollapseSidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </svg>
  )
}
