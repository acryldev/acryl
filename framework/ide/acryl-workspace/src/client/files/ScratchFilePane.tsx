/** The untitled scratch file tab: a path box and a text area, kept in the tab's own state. */

import type { WorkspaceState, WorkspaceTile } from '../canvas/state.ts'

export function ScratchFilePane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  return (
    <div className="dshWorkspaceFile">
      <input
        aria-label="File path"
        placeholder="/absolute/or/workspace/path.ts"
        value={tile.path ?? ''}
        onChange={(event) => { workspace.updateTile(tile.id, { path: event.target.value }) }}
      />
      <textarea
        aria-label="File editor"
        spellCheck={false}
        value={tile.content ?? ''}
        onChange={(event) => { workspace.updateTile(tile.id, { content: event.target.value }) }}
      />
    </div>
  )
}
