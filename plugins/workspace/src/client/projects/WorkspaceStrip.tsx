/**
 * The strip below the project tree (spec 043): Add project (into the shown workspace), one button per workspace, and New workspace. The
 * whole sidebar is the shown workspace; a button switches it.
 */

import type { ReactElement } from 'react'
import { DEFAULT_WORKSPACE_ID, type WorkspaceSummary } from '../../projects/contract.ts'

export interface WorkspaceStripProps {
  readonly workspaces: readonly WorkspaceSummary[]
  readonly current: string
  onAddProject(): void
  onSwitch(id: string): void
  onNew(): void
}

const KIND_LABEL: Record<WorkspaceSummary['kind'], string> = {
  individual: 'Individual Projects',
  shared: 'Shared Context',
  remote: 'Remote Machine',
}

/** Default is a dot; another workspace is its name's first letter. */
function mark(workspace: WorkspaceSummary): string {
  if (workspace.id === DEFAULT_WORKSPACE_ID) return '●'
  return (workspace.name.trim()[0] ?? '?').toUpperCase()
}

function AddFolderIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 11v5" /><path d="M9.5 13.5h5" />
    </svg>
  )
}

export function WorkspaceStrip({ workspaces, current, onAddProject, onSwitch, onNew }: WorkspaceStripProps): ReactElement {
  return (
    <div className="dshWorkspaceStrip" role="toolbar" aria-label="Workspaces">
      <button type="button" className="dshWorkspaceStripButton" aria-label="Add project to this workspace" title="Add project to this workspace" onClick={onAddProject}>
        <AddFolderIcon />
      </button>
      <span className="dshWorkspaceStripSpacer" />
      {workspaces.map(workspace => (
        <button
          key={workspace.id}
          type="button"
          className="dshWorkspaceStripButton dshWorkspaceStripWorkspace"
          aria-pressed={workspace.id === current}
          aria-label={`Workspace ${workspace.name}`}
          title={`${workspace.name} - ${KIND_LABEL[workspace.kind]}${workspace.remote === undefined ? '' : ` (${workspace.remote.host})`}`}
          data-kind={workspace.kind}
          onClick={() => { if (workspace.id !== current) onSwitch(workspace.id) }}
        >
          {mark(workspace)}
        </button>
      ))}
      <button type="button" className="dshWorkspaceStripButton" aria-label="New workspace" title="New workspace" onClick={onNew}>+</button>
    </div>
  )
}
