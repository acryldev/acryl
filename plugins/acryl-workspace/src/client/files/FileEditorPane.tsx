/** The editor tab for one real file of a worktree: load, edit, save, with drafts kept when you switch tabs. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { FileConflictError, type WorkspaceFilesApi } from './files-api.ts'

export interface FileEditorPaneProps {
  readonly tile: WorkspaceTile
  readonly workspace: WorkspaceState
  readonly filesApi: WorkspaceFilesApi
}

type Loaded =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'binary'; readonly size: number }
  /** `disk` is the text last known to be on disk; `draft` is what the editor starts with. */
  | { readonly phase: 'ready'; readonly disk: string; readonly draft: string; readonly mtimeMs: number; readonly staleDraft: boolean }

/** How long typing pauses before the draft is copied to the tab state (kept across tab switches). */
const DRAFT_DELAY_MS = 400

export function FileEditorPane({ tile, workspace, filesApi }: FileEditorPaneProps) {
  const worktree = tile.fileWorktree
  const file = tile.fileRel
  const [loaded, setLoaded] = useState<Loaded>({ phase: 'loading' })
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<{ kind: 'saved' | 'error' | 'conflict'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [keepDraft, setKeepDraft] = useState(false)
  const text = useRef('')
  const disk = useRef({ text: '', mtimeMs: 0 })
  const timer = useRef<number | undefined>(undefined)
  // The tile's saved draft at the moment of loading; later draft updates come from this pane itself.
  const initialDraft = useRef({ content: tile.content, mtimeMs: tile.fileMtimeMs })
  initialDraft.current = { content: tile.content, mtimeMs: tile.fileMtimeMs }

  const flushDraft = useCallback((): void => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (text.current === disk.current.text) workspace.clearFileDraft(tile.id)
    else workspace.setFileDraft(tile.id, text.current, disk.current.mtimeMs)
  }, [workspace, tile.id])

  useEffect(() => {
    if (worktree === undefined || file === undefined) return
    let current = true
    setLoaded({ phase: 'loading' })
    setStatus(null)
    setKeepDraft(false)
    filesApi.read(worktree, file).then(
      (view) => {
        if (!current) return
        if (view.binary) { setLoaded({ phase: 'binary', size: view.size }); return }
        const saved = initialDraft.current
        const hasDraft = saved.content !== undefined && revision === 0
        // A draft made against an older disk version must not silently overwrite what changed since.
        const staleDraft = hasDraft && saved.mtimeMs !== view.mtimeMs
        const draft = hasDraft ? saved.content ?? view.content : view.content
        disk.current = { text: view.content, mtimeMs: view.mtimeMs }
        text.current = draft
        setLoaded({ phase: 'ready', disk: view.content, draft, mtimeMs: view.mtimeMs, staleDraft })
      },
      (cause: unknown) => { if (current) setLoaded({ phase: 'error', message: cause instanceof Error ? cause.message : 'Could not open the file.' }) },
    )
    return () => { current = false }
  }, [filesApi, worktree, file, revision])

  // Copy the draft into the tab state when this pane goes away (tab switch, close), so nothing typed is lost.
  useEffect(() => () => {
    if (timer.current !== undefined) flushDraft()
  }, [flushDraft])

  const changed = (next: string): void => {
    text.current = next
    setStatus(null)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flushDraft, DRAFT_DELAY_MS)
  }

  const save = async (overwrite = false): Promise<void> => {
    if (worktree === undefined || file === undefined || loaded.phase !== 'ready' || saving) return
    setSaving(true)
    try {
      const saved = await filesApi.write(worktree, file, text.current, overwrite ? await currentMtime(filesApi, worktree, file) : disk.current.mtimeMs)
      disk.current = { text: text.current, mtimeMs: saved.mtimeMs }
      workspace.clearFileDraft(tile.id)
      setStatus({ kind: 'saved', message: 'Saved' })
    } catch (cause) {
      if (cause instanceof FileConflictError) setStatus({ kind: 'conflict', message: 'The file changed on disk since you opened it.' })
      else setStatus({ kind: 'error', message: cause instanceof Error ? cause.message : 'Could not save the file.' })
    } finally {
      setSaving(false)
    }
  }

  const reloadFromDisk = (): void => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    workspace.clearFileDraft(tile.id)
    setRevision(n => n + 1)
  }

  if (worktree === undefined || file === undefined) return null
  const dirty = tile.content !== undefined || (loaded.phase === 'ready' && text.current !== disk.current.text)

  return (
    <div className="dshWorkspaceEditor">
      <div className="dshWorkspaceEditorBar">
        <span className="dshWorkspaceEditorPath" title={`${worktree}/${file}`}>{file}{dirty ? ' ●' : ''}</span>
        {status !== null && <span className="dshWorkspaceEditorStatus" data-kind={status.kind}>{status.message}</span>}
        <button type="button" className="dshWorkspaceEditorButton" disabled={loaded.phase !== 'ready' || saving} onClick={() => { void save() }} title="Save (Cmd or Ctrl+S)">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {status?.kind === 'conflict' && (
        <div className="dshWorkspaceEditorBanner" role="alert">
          {status.message}
          <button type="button" onClick={() => { void save(true) }}>Overwrite with my text</button>
          <button type="button" onClick={reloadFromDisk}>Discard mine and reload</button>
        </div>
      )}
      {loaded.phase === 'ready' && loaded.staleDraft && !keepDraft && (
        <div className="dshWorkspaceEditorBanner" role="alert">
          The file changed on disk after you started this draft.
          <button type="button" onClick={() => { setKeepDraft(true) }}>Keep my draft</button>
          <button type="button" onClick={reloadFromDisk}>Discard my draft and load the disk version</button>
        </div>
      )}
      {loaded.phase === 'loading' && <p className="dshWorkspaceChangesEmpty">Opening...</p>}
      {loaded.phase === 'error' && <p className="dshWorkspaceChangesError" role="alert">{loaded.message}</p>}
      {loaded.phase === 'binary' && <p className="dshWorkspaceChangesEmpty">This is a binary file ({loaded.size} bytes) and is not shown.</p>}
      {loaded.phase === 'ready' && (
        <CodeEditor key={`${worktree}\n${file}\n${String(revision)}`} value={loaded.draft} filename={file} onChange={changed} onSave={() => { void save() }} />
      )}
    </div>
  )
}

/** Re-read the file to learn its current modification time, for an explicit overwrite. */
async function currentMtime(filesApi: WorkspaceFilesApi, worktree: string, file: string): Promise<number> {
  return (await filesApi.read(worktree, file)).mtimeMs
}
