/** Diff tile, git mode: one changed file's unified diff against HEAD, with line numbers. */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { GitDiffView } from '../../git/contract.ts'
import type { SendResult } from '../sessions/agent-bridge.ts'
import type { CommentSide, ReviewCommentInput } from './comment-message.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { WorkspaceTile } from '../canvas/state.ts'
import { parseUnifiedDiff } from './unified-diff.ts'

/** Rendering beyond this many rows is cut, so one huge diff cannot freeze the window. */
export const MAX_RENDERED_ROWS = 5000

type Load =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly view: GitDiffView }
  | { readonly phase: 'error'; readonly message: string }

/**
 * A primitive fingerprint of how git currently sees one file (status letter, staged flag, line
 * counts). When it moves, the shown diff is stale and is fetched again.
 */
export function changeSignature(shell: WorkspaceShellState, worktree: string, file: string): string {
  for (const repo of shell.getSnapshot().repos) {
    const found = repo.worktrees.find(entry => entry.path === worktree)
    if (found === undefined) continue
    const change = found.changes.find(entry => entry.path === file)
    return change === undefined
      ? 'none'
      : `${change.code}:${String(change.staged)}:${String(change.added)}:${String(change.removed)}`
  }
  return 'unknown'
}

export interface GitDiffPaneProps {
  readonly tile: WorkspaceTile
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
  /**
   * Deliver a line comment to the agent. When absent the diff is read-only (no comment buttons).
   * The pane supplies the file and line; the caller adds anything else the message needs.
   */
  readonly sendComment?: (input: Omit<ReviewCommentInput, 'branch'>) => Promise<SendResult>
}

export function GitDiffPane({ tile, shell, gitApi, sendComment }: GitDiffPaneProps) {
  const worktree = tile.diffWorktree ?? ''
  const file = tile.diffFile ?? ''
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const signature = useSyncExternalStore(subscribe, () => changeSignature(shell, worktree, file))
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [reloads, setReloads] = useState(0)
  // Line comments: which line's composer is open, its draft, and what was already sent this view.
  const [composer, setComposer] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState<Readonly<Record<string, readonly string[]>>>({})
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    let cancelled = false
    // Keep showing the previous diff while a refresh is in flight so the view does not flicker.
    setLoad(previous => previous.phase === 'ready' ? previous : { phase: 'loading' })
    gitApi.diff(worktree, file).then((view) => {
      if (!cancelled) setLoad({ phase: 'ready', view })
    }, (cause: unknown) => {
      if (!cancelled) setLoad({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    })
    return () => { cancelled = true }
  }, [gitApi, worktree, file, signature, reloads])

  const rows = useMemo(() => load.phase === 'ready' ? parseUnifiedDiff(load.view.text) : [], [load])
  const shown = rows.length > MAX_RENDERED_ROWS ? rows.slice(0, MAX_RENDERED_ROWS) : rows
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === 'add') added += 1
    else if (row.kind === 'remove') removed += 1
  }

  return (
    <div className="dshWorkspaceGitDiff" data-diff-file={file}>
      <div className="dshWorkspaceGitDiffBar">
        <span className="dshWorkspaceGitDiffFile" title={`${worktree}/${file}`}>{file}</span>
        {load.phase === 'ready' && !load.view.binary && (
          <span className="dshWorkspaceGitDiffCounts">
            <span data-kind="add">+{added}</span> <span data-kind="remove">-{removed}</span>
          </span>
        )}
        <button
          type="button"
          className="dshWorkspaceGitDiffRefresh"
          aria-label="Refresh diff"
          title="Refresh"
          onClick={() => { setReloads(count => count + 1) }}
        >
          ↻
        </button>
      </div>
      <div className="dshWorkspaceGitDiffBody" role="region" aria-label="Diff result">
        {load.phase === 'loading' && <p className="dshWorkspaceGitDiffNote">Loading diff...</p>}
        {load.phase === 'error' && <p className="dshWorkspaceGitDiffNote" data-tone="error" role="alert">{load.message}</p>}
        {load.phase === 'ready' && load.view.binary && <p className="dshWorkspaceGitDiffNote">Binary file - no text diff.</p>}
        {load.phase === 'ready' && !load.view.binary && rows.length === 0 && (
          <p className="dshWorkspaceGitDiffNote">No differences against HEAD.</p>
        )}
        {shown.map((row, index) => {
          if (row.kind === 'meta') return null
          const side: CommentSide = row.kind === 'remove' ? 'old' : 'new'
          const line = row.kind === 'remove' ? row.oldNo : row.newNo
          const key = row.kind === 'hunk' || line === undefined ? undefined : `${side}:${String(line)}`
          const commentKind = row.kind === 'add' || row.kind === 'remove' || row.kind === 'context' ? row.kind : undefined
          const submit = async (): Promise<void> => {
            if (sendComment === undefined || key === undefined || line === undefined || commentKind === undefined) return
            const text = draft.trim()
            if (text === '' || sending) return
            setSending(true)
            setSendError(null)
            const result = await sendComment({ file, side, line, kind: commentKind, lineText: row.text, comment: text })
            if (!mounted.current) return
            setSending(false)
            if (result.ok) {
              setSent(previous => ({ ...previous, [key]: [...(previous[key] ?? []), text] }))
              setComposer(null)
              setDraft('')
            } else {
              setSendError(result.reason)
            }
          }
          return (
            <Fragment key={index}>
              <div className="dshWorkspaceGitDiffLine" data-kind={row.kind}>
                {sendComment !== undefined && key !== undefined
                  ? (
                      <button
                        type="button"
                        className="dshWorkspaceGitDiffAdd"
                        aria-label={`Comment on ${side} line ${String(line)}`}
                        title="Comment for the agent"
                        onClick={() => { setComposer(key); setDraft(''); setSendError(null) }}
                      >
                        +
                      </button>
                    )
                  : <span className="dshWorkspaceGitDiffAdd" />}
                <span className="dshWorkspaceGitDiffNo">{row.oldNo ?? ''}</span>
                <span className="dshWorkspaceGitDiffNo">{row.newNo ?? ''}</span>
                <span className="dshWorkspaceGitDiffMarker">
                  {row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : row.kind === 'hunk' ? '' : ' '}
                </span>
                <span className="dshWorkspaceGitDiffText">{row.text}</span>
              </div>
              {key !== undefined && (sent[key] ?? []).map((text, sentIndex) => (
                <div key={sentIndex} className="dshWorkspaceGitDiffSent">Sent to the agent: {text}</div>
              ))}
              {key !== undefined && composer === key && (
                <form
                  className="dshWorkspaceGitDiffComposer"
                  onSubmit={(event) => { event.preventDefault(); void submit() }}
                >
                  <textarea
                    aria-label="Comment for the agent"
                    placeholder="Tell the agent what to change here (Cmd/Ctrl+Enter to send)"
                    autoFocus
                    value={draft}
                    onChange={(event) => { setDraft(event.target.value) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void submit()
                      } else if (event.key === 'Escape') {
                        setComposer(null)
                      }
                    }}
                  />
                  <div className="dshWorkspaceGitDiffComposerActions">
                    {sendError !== null && <span className="dshWorkspaceGitDiffComposerError" role="alert">{sendError}</span>}
                    <button type="button" onClick={() => { setComposer(null) }}>Cancel</button>
                    <button type="submit" disabled={sending || draft.trim() === ''}>
                      {sending ? 'Sending...' : 'Send to agent'}
                    </button>
                  </div>
                </form>
              )}
            </Fragment>
          )
        })}
        {rows.length > MAX_RENDERED_ROWS && (
          <p className="dshWorkspaceGitDiffNote">Showing the first {MAX_RENDERED_ROWS} of {rows.length} lines.</p>
        )}
        {load.phase === 'ready' && load.view.truncated && (
          <p className="dshWorkspaceGitDiffNote">The diff was cut at the size limit.</p>
        )}
      </div>
    </div>
  )
}
