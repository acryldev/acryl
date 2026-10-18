/** The right panel's entries for this package's tabs (Code, Changes, Review, Checks, Comments), drawn like the panel's own glyphs: one stroke, current color. */

import type { ReactElement, ReactNode } from 'react'

export interface PanelIconProps {
  readonly size?: number | undefined
  readonly className?: string | undefined
}

function Glyph({ size = 16, className, children }: PanelIconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  )
}

/** Code: angle brackets. */
export function CodeGlyph(props: PanelIconProps): ReactElement {
  return <Glyph {...props}><path d="M8.5 7 3.5 12l5 5" /><path d="m15.5 7 5 5-5 5" /></Glyph>
}

/** Changes: a branch with a changed commit. */
export function ChangesGlyph(props: PanelIconProps): ReactElement {
  return <Glyph {...props}><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="8.5" r="2" /><path d="M6 7.5v9" /><path d="M18 10.5c0 4-6 3.5-11 6.5" /></Glyph>
}

/** Review: a speech bubble with lines. */
export function ReviewGlyph(props: PanelIconProps): ReactElement {
  return <Glyph {...props}><path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" /><path d="M8 9h8" /><path d="M8 12h5" /></Glyph>
}

/** Checks: a check mark in a circle. */
export function ChecksGlyph(props: PanelIconProps): ReactElement {
  return <Glyph {...props}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></Glyph>
}

/** Comments: two overlapping speech bubbles (a note on a line, kept until used). */
export function CommentsGlyph(props: PanelIconProps): ReactElement {
  return <Glyph {...props}><path d="M3.5 4.5h11v7.5H8L4.5 15v-3h-1z" /><path d="M17.5 8.5h3v8.5h-1v3l-3.5-3h-5.5v-2" /></Glyph>
}
