/** The scratch doc tab: markdown source beside its rendered preview. */

import { useMemo } from 'react'
import type { WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import { DocView } from './DocView.tsx'
import { parseDoc } from './doc-format.ts'

export function DocPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const text = tile.docText ?? ''
  const blocks = useMemo(() => parseDoc(text), [text])
  return (
    <div className="dshWorkspaceDoc">
      <textarea
        aria-label="Doc source"
        className="dshWorkspaceDocEditor"
        spellCheck={false}
        placeholder="# Heading&#10;&#10;- bullet&#10;- **bold** and *italic*"
        value={text}
        onChange={(event) => { workspace.updateTile(tile.id, { docText: event.target.value }) }}
      />
      <div className="dshWorkspaceDocPreview" aria-label="Doc preview">
        <DocView blocks={blocks} />
      </div>
    </div>
  )
}
