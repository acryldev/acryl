/** Small line icons for the dock's buttons. They inherit the text colour. */

import type { DockMode } from './dock-model.ts'

const props = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function TerminalIcon() {
  return <svg {...props}><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M5 7l2 1.5L5 10M8.5 10.5H11" /></svg>
}

export function BranchIcon() {
  return <svg {...props}><circle cx="4.5" cy="4" r="1.5" /><circle cx="4.5" cy="12" r="1.5" /><circle cx="11.5" cy="6" r="1.5" /><path d="M4.5 5.5v5M11.5 7.5c0 2-3 2.5-7 3" /></svg>
}

/** The icon of a layout: a frame with the terminal panel drawn where that mode puts it. */
export function ModeIcon({ mode }: { readonly mode: DockMode }) {
  return (
    <svg {...props}>
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      {mode === 'stacked' && <path d="M9 2.5v11M9 8h5" />}
      {mode === 'bottom' && <path d="M2 9.5h12" />}
      {mode === 'side' && <path d="M8 2.5v11" />}
    </svg>
  )
}

export function ChevronDownIcon() {
  return <svg {...props}><path d="M4 6.5l4 4 4-4" /></svg>
}
