/** The slim status line under the workspace. */

import type { StatusSegment } from './status-line.ts'

export function StatusLine({ segments }: { readonly segments: readonly StatusSegment[] }) {
  if (segments.length === 0) return null
  return (
    <div className="dshWorkspaceStatusLine" role="status" aria-label="Workspace status">
      {segments.map(segment => (
        <span key={segment.id} className="dshWorkspaceStatusSegment" data-segment={segment.id} title={segment.title}>{segment.text}</span>
      ))}
    </div>
  )
}
