/** The scratch diff tab: two text areas in, a line diff out. */

import { useMemo } from 'react'
import type { WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import { diffLines } from './line-diff.ts'

export function TextDiffPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const before = tile.diffBefore ?? ''
  const after = tile.diffAfter ?? ''
  const lines = useMemo(() => diffLines(before, after), [before, after])
  return (
    <div className="dshWorkspaceDiff">
      <div className="dshWorkspaceDiffInputs">
        <textarea
          aria-label="Before"
          placeholder="Before"
          spellCheck={false}
          value={before}
          onChange={(event) => { workspace.updateTile(tile.id, { diffBefore: event.target.value }) }}
        />
        <textarea
          aria-label="After"
          placeholder="After"
          spellCheck={false}
          value={after}
          onChange={(event) => { workspace.updateTile(tile.id, { diffAfter: event.target.value }) }}
        />
      </div>
      <div className="dshWorkspaceDiffOutput" aria-label="Diff result">
        {lines.map((line, index) => (
          // eslint-disable-next-line react/no-array-index-key -- diff lines have no stable identity
          <div key={index} className="dshWorkspaceDiffLine" data-diff-kind={line.kind}>
            <span className="dshWorkspaceDiffMarker">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
            <span className="dshWorkspaceDiffText">{line.text.length === 0 ? ' ' : line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
