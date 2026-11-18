/** The slim status line under the workspace. */

import type { StatusSegment } from './status-line.ts'

export interface StatusAction {
  readonly label: string
  readonly title: string
  run(): void
}

export function StatusLine({ segments, action }: { readonly segments: readonly StatusSegment[]; readonly action?: StatusAction }) {
  if (segments.length === 0 && action === undefined) return null
  return (
    <div className="dshWorkspaceStatusLine" role="status" aria-label="Workspace status">
      {segments.map(segment => (
        <span key={segment.id} className="dshWorkspaceStatusSegment" data-segment={segment.id} title={segment.title}>{segment.text}</span>
      ))}
      {action !== undefined && (
        <button type="button" className="dshWorkspaceStatusAction" title={action.title} onClick={action.run}>{action.label}</button>
      )}
    </div>
  )
}
