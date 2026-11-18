/**
 * Diff tile, git mode: one changed file's diff against HEAD, in a unified or side-by-side layout, with line
 * numbers, and line or line-range comments sent to the agent.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { GitDiffView } from '../../git/contract.ts'
import type { SendResult } from '../sessions/agent-bridge.ts'
import type { CommentSide, ReviewCommentInput } from './comment-message.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { WorkspaceTile } from '../canvas/state.ts'
import { readDiffLayout, writeDiffLayout, type DiffLayout } from './diff-layout.ts'
import { pairRows, parseUnifiedDiff, rowsInRange, type UnifiedRow } from './unified-diff.ts'

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

/** What the user has picked to comment on: one line, or a range of lines, on one side of the diff. */
interface Selection {
  readonly side: CommentSide
  readonly from: number
  readonly to: number
}

const selectionKey = (selection: Selection): string => `${selection.side}:${String(selection.from)}-${String(selection.to)}`

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const numberOf = (row: UnifiedRow, side: CommentSide): number | undefined => (side === 'old' ? row.oldNo : row.newNo)

export function GitDiffPane({ tile, shell, gitApi, sendComment }: GitDiffPaneProps) {
  const worktree = tile.diffWorktree ?? ''
  const file = tile.diffFile ?? ''
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const signature = useSyncExternalStore(subscribe, () => changeSignature(shell, worktree, file))
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [reloads, setReloads] = useState(0)
  const [layout, setLayout] = useState<DiffLayout>(() => readDiffLayout(browserStorage()))
  // Line comments: the picked line or range, its draft, and what was already sent this view.
  const [selection, setSelection] = useState<Selection | null>(null)
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
  const shown = useMemo(() => rows.length > MAX_RENDERED_ROWS ? rows.slice(0, MAX_RENDERED_ROWS) : rows, [rows])
  const pairs = useMemo(() => layout === 'split' ? pairRows(shown) : [], [layout, shown])
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === 'add') added += 1
    else if (row.kind === 'remove') removed += 1
  }

  const choose = (side: CommentSide, line: number, extend: boolean): void => {
    setDraft('')
    setSendError(null)
    setSelection((previous) => {
      if (extend && previous !== null && previous.side === side) {
        return { side, from: Math.min(previous.from, line), to: Math.max(previous.to, line) }
      }
      return { side, from: line, to: line }
    })
  }

  const changeLayout = (next: DiffLayout): void => {
    setLayout(next)
    writeDiffLayout(browserStorage(), next)
  }

  const submit = async (): Promise<void> => {
    if (sendComment === undefined || selection === null || sending) return
    const text = draft.trim()
    if (text === '') return
    const covered = rowsInRange(rows, selection.side, selection.from, selection.to)
    const first = covered[0]
    if (first === undefined || first.kind === 'meta' || first.kind === 'hunk') return
    const range = selection.to > selection.from
    setSending(true)
    setSendError(null)
    const result = await sendComment({
      file,
      side: selection.side,
      line: selection.from,
      ...(range ? { endLine: selection.to } : {}),
      kind: first.kind,
      lineText: first.text,
      ...(range ? { rangeLines: covered.flatMap(row => row.kind === 'meta' || row.kind === 'hunk' ? [] : [{ kind: row.kind, text: row.text }]) } : {}),
      comment: text,
    })
    if (!mounted.current) return
    setSending(false)
    if (result.ok) {
      const key = selectionKey(selection)
      setSent(previous => ({ ...previous, [key]: [...(previous[key] ?? []), text] }))
      setSelection(null)
      setDraft('')
    } else {
      setSendError(result.reason)
    }
  }

  const inSelection = (side: CommentSide, line: number | undefined): boolean =>
    selection !== null && line !== undefined && selection.side === side && line >= selection.from && line <= selection.to

  /** Where the composer and the sent notes hang: under the row that holds the last line of the selection. */
  const endsSelection = (side: CommentSide, line: number | undefined): boolean =>
    selection !== null && line !== undefined && selection.side === side && line === selection.to

  const tail = (side: CommentSide, line: number | undefined): ReactNode => {
    if (line === undefined) return null
    const notes = Object.entries(sent).filter(([key]) => key.startsWith(`${side}:`) && key.endsWith(`-${String(line)}`))
    return (
      <>
        {notes.flatMap(([key, texts]) => texts.map((text, i) => (
          <div key={`${key}:${String(i)}`} className="dshWorkspaceGitDiffSent">Sent to the agent: {text}</div>
        )))}
        {endsSelection(side, line) && selection !== null && (
          <form className="dshWorkspaceGitDiffComposer" onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <textarea
              aria-label="Comment for the agent"
              placeholder={selection.to > selection.from
                ? `Comment on lines ${String(selection.from)}-${String(selection.to)} (Cmd/Ctrl+Enter to send)`
                : 'Tell the agent what to change here (Cmd/Ctrl+Enter to send)'}
              autoFocus
              value={draft}
              onChange={(event) => { setDraft(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void submit()
                } else if (event.key === 'Escape') {
                  setSelection(null)
                }
              }}
            />
            <div className="dshWorkspaceGitDiffComposerActions">
              {sendError !== null && <span className="dshWorkspaceGitDiffComposerError" role="alert">{sendError}</span>}
              <button type="button" onClick={() => { setSelection(null) }}>Cancel</button>
              <button type="submit" disabled={sending || draft.trim() === ''}>
                {sending ? 'Sending...' : 'Send to agent'}
              </button>
            </div>
          </form>
        )}
      </>
    )
  }

  const addButton = (row: UnifiedRow, side: CommentSide): ReactNode => {
    const line = numberOf(row, side)
    if (sendComment === undefined || line === undefined) return <span className="dshWorkspaceGitDiffAdd" />
    return (
      <button
        type="button"
        className="dshWorkspaceGitDiffAdd"
        aria-label={`Comment on ${side} line ${String(line)}`}
        title="Comment for the agent (Shift-click another line to comment on a range)"
        onClick={(event) => { choose(side, line, event.shiftKey) }}
      >
        +
      </button>
    )
  }

  const unifiedLine = (row: UnifiedRow, index: number): ReactNode => {
    if (row.kind === 'meta') return null
    const side: CommentSide = row.kind === 'remove' ? 'old' : 'new'
    const line = numberOf(row, side)
    return (
      <Fragment key={index}>
        <div className="dshWorkspaceGitDiffLine" data-kind={row.kind} data-selected={row.kind !== 'hunk' && inSelection(side, line) ? '' : undefined}>
          {row.kind === 'hunk' ? <span className="dshWorkspaceGitDiffAdd" /> : addButton(row, side)}
          <span className="dshWorkspaceGitDiffNo">{row.oldNo ?? ''}</span>
          <span className="dshWorkspaceGitDiffNo">{row.newNo ?? ''}</span>
          <span className="dshWorkspaceGitDiffMarker">
            {row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : row.kind === 'hunk' ? '' : ' '}
          </span>
          <span className="dshWorkspaceGitDiffText">{row.text}</span>
        </div>
        {row.kind !== 'hunk' && tail(side, line)}
      </Fragment>
    )
  }

  const cell = (row: UnifiedRow | undefined, side: CommentSide): ReactNode => {
    if (row === undefined) return <div className="dshWorkspaceGitDiffCell" data-kind="empty" />
    const line = numberOf(row, side)
    return (
      <div className="dshWorkspaceGitDiffCell" data-kind={row.kind} data-selected={inSelection(side, line) ? '' : undefined}>
        {addButton(row, side)}
        <span className="dshWorkspaceGitDiffNo">{line ?? ''}</span>
        <span className="dshWorkspaceGitDiffMarker">{row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' '}</span>
        <span className="dshWorkspaceGitDiffText">{row.text}</span>
      </div>
    )
  }

  return (
    <div className="dshWorkspaceGitDiff" data-diff-file={file} data-layout={layout}>
      <div className="dshWorkspaceGitDiffBar">
        <span className="dshWorkspaceGitDiffFile" title={`${worktree}/${file}`}>{file}</span>
        {load.phase === 'ready' && !load.view.binary && (
          <span className="dshWorkspaceGitDiffCounts">
            <span data-kind="add">+{added}</span> <span data-kind="remove">-{removed}</span>
          </span>
        )}
        <span className="dshWorkspaceGitDiffLayout" role="group" aria-label="Diff layout">
          <button type="button" aria-pressed={layout === 'unified'} onClick={() => { changeLayout('unified') }}>Unified</button>
          <button type="button" aria-pressed={layout === 'split'} onClick={() => { changeLayout('split') }}>Side by side</button>
        </span>
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
        {layout === 'unified' && shown.map(unifiedLine)}
        {layout === 'split' && pairs.map((pair, index) => {
          if (pair.kind === 'hunk') {
            return <div key={index} className="dshWorkspaceGitDiffLine" data-kind="hunk"><span className="dshWorkspaceGitDiffText">{pair.text}</span></div>
          }
          const leftLine = pair.left === undefined ? undefined : numberOf(pair.left, 'old')
          const rightLine = pair.right === undefined ? undefined : numberOf(pair.right, 'new')
          return (
            <Fragment key={index}>
              <div className="dshWorkspaceGitDiffPair">
                {cell(pair.left, 'old')}
                {cell(pair.right, 'new')}
              </div>
              {pair.left !== undefined && pair.left.kind !== 'context' && tail('old', leftLine)}
              {pair.right !== undefined && tail('new', rightLine)}
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
