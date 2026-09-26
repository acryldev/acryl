/** The Doc tab for one real markdown file: read-only, rendered, and kept current while an agent edits it. */

import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceTile } from '../canvas/state.ts'
import type { WorkspaceFilesApi } from '../files/files-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { DocView } from './DocView.tsx'
import { parseDoc } from './doc-format.ts'

export interface DocFilePaneProps {
  readonly tile: WorkspaceTile
  readonly shell: WorkspaceShellState
  readonly filesApi: WorkspaceFilesApi
  /** How often the file is checked for changes. */
  readonly pollMs?: number
}

type Loaded =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'binary' }
  | { readonly phase: 'ready'; readonly text: string; readonly mtimeMs: number }

export function DocFilePane({ tile, shell, filesApi, pollMs = 2000 }: DocFilePaneProps) {
  const worktree = tile.docWorktree
  const file = tile.docRel
  const [loaded, setLoaded] = useState<Loaded>({ phase: 'loading' })

  useEffect(() => {
    if (worktree === undefined || file === undefined) return
    let current = true
    let mtime = -1
    const load = (): void => {
      filesApi.read(worktree, file).then(
        (view) => {
          if (!current) return
          if (view.binary) { setLoaded({ phase: 'binary' }); return }
          if (view.mtimeMs === mtime) return
          mtime = view.mtimeMs
          setLoaded({ phase: 'ready', text: view.content, mtimeMs: view.mtimeMs })
        },
        (cause: unknown) => { if (current) setLoaded({ phase: 'error', message: cause instanceof Error ? cause.message : 'Could not open the file.' }) },
      )
    }
    setLoaded({ phase: 'loading' })
    load()
    const timer = window.setInterval(load, pollMs)
    return () => { current = false; window.clearInterval(timer) }
  }, [filesApi, worktree, file, pollMs])

  const blocks = useMemo(() => (loaded.phase === 'ready' ? parseDoc(loaded.text) : []), [loaded])
  if (worktree === undefined || file === undefined) return null
  return (
    <div className="dshWorkspaceDocFile">
      <div className="dshWorkspaceEditorBar">
        <span className="dshWorkspaceEditorPath" title={`${worktree}/${file}`}>{file}</span>
        <span className="dshWorkspaceEditorStatus">read-only preview</span>
        <button type="button" className="dshWorkspaceEditorButton" onClick={() => { shell.openFile({ worktree, file }) }}>Edit</button>
      </div>
      {loaded.phase === 'loading' && <p className="dshWorkspaceChangesEmpty">Opening...</p>}
      {loaded.phase === 'error' && <p className="dshWorkspaceChangesError" role="alert">{loaded.message}</p>}
      {loaded.phase === 'binary' && <p className="dshWorkspaceChangesEmpty">This is a binary file and is not shown.</p>}
      {loaded.phase === 'ready' && <div className="dshWorkspaceDocPreview dshWorkspaceDocFileBody" aria-label="Document"><DocView blocks={blocks} /></div>}
    </div>
  )
}
