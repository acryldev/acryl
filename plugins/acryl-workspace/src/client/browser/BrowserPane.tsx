/** The browser tab: an address bar and a sandboxed frame. */

import { useState } from 'react'
import { normalizeBrowserUrl, type WorkspaceState, type WorkspaceTile } from '../canvas/state.ts'

export function BrowserPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const [draft, setDraft] = useState(tile.url ?? '')
  const href = tile.url ?? ''
  return (
    <div className="dshWorkspaceBrowser">
      <form
        className="dshWorkspaceBrowserBar"
        onSubmit={(event) => {
          event.preventDefault()
          const next = normalizeBrowserUrl(draft)
          if (next !== undefined) workspace.updateTile(tile.id, { url: next })
        }}
      >
        <input
          aria-label="Browser address"
          value={draft}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button type="submit">Go</button>
      </form>
      {href.length > 0 && (
        <iframe
          className="dshWorkspaceBrowserFrame"
          title="Browser tab"
          src={href}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      )}
    </div>
  )
}
