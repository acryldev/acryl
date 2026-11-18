/**
 * Right pane tab: every comment on the selected worktree's files that has not been used yet. Each can be copied, sent into one of the open
 * terminals or agents, or closed; so can all of them at once. Copying or sending uses a comment up: it leaves the list and its note closes.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@acryl/ui/frame'
import { splitPath } from '../changes/ChangesBody.tsx'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { CommentStore, OpenComment } from './comment-store.ts'
import type { TerminalTarget } from './terminal-targets.ts'
import { copyComments, sendComments, type PasteTarget, type UseResult, type WriteText } from './use-comments.ts'

/** What the page needs from the open terminals. */
export interface CommentTerminals {
  /** The open terminals and agents, the worktree's own first. */
  readonly list: (worktree: string) => readonly TerminalTarget[]
  readonly pasteTarget: (terminalId: string) => PasteTarget | undefined
  /** Bring the terminal's tab to the front and give it the keyboard. */
  readonly reveal: (target: TerminalTarget) => void
}

export type CommentsBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly comments: CommentStore
  readonly terminals: CommentTerminals
  readonly writeText: WriteText | undefined
}

export function CommentsBody({ shell, comments, terminals, writeText }: CommentsBodyProps) {
  const subscribeShell = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const subscribeComments = useCallback((listener: () => void) => comments.subscribe(listener), [comments])
  useSyncExternalStore(subscribeShell, () => shell.getSnapshot())
  useSyncExternalStore(subscribeComments, () => comments.getVersion())
  const [problem, setProblem] = useState<string | null>(null)
  const worktree = shell.selectedWorktree()

  if (worktree === undefined) {
    return (
      <div className="dshWorkspaceComments" data-empty>
        <p className="dshWorkspaceChangesEmpty">Select a worktree in the Projects list to see its comments.</p>
      </div>
    )
  }

  const list = comments.forWorktree(worktree.path)
  const report = (result: UseResult): void => { setProblem(result.ok ? null : result.message) }
  const send = (target: TerminalTarget, chosen: readonly OpenComment[]): void => {
    const result = sendComments(comments, terminals.pasteTarget(target.terminalId), chosen)
    report(result)
    if (result.ok) terminals.reveal(target)
  }

  return (
    <div className="dshWorkspaceComments">
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{worktree.branch ?? 'detached'}</strong>
          <span className="dshWorkspaceChangesMeta">{list.length === 1 ? '1 comment' : `${String(list.length)} comments`}</span>
        </div>
        {list.length > 0 && (
          <div className="dshWorkspaceCommentsActions">
            <button type="button" onClick={() => { void copyComments(comments, writeText, list).then(report) }}>Copy all</button>
            <SendMenu label="Send all to" targets={() => terminals.list(worktree.path)} onChoose={(target) => { send(target, list) }} />
          </div>
        )}
      </header>
      {problem !== null && <p className="dshWorkspaceChangesError" role="alert">{problem}</p>}
      {list.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">No comments. Open a file and press + beside a line to write one; it is kept here until you copy or send it.</p>
      )}
      <ul className="dshWorkspaceThreadList">
        {list.map(comment => (
          <li key={comment.id}>
            <CommentRow
              comment={comment}
              onOpen={() => { shell.openFile({ worktree: comment.worktree, file: comment.file }) }}
              onCopy={() => { void copyComments(comments, writeText, [comment]).then(report) }}
              targets={() => terminals.list(worktree.path)}
              onSend={(target) => { send(target, [comment]) }}
              onClose={() => { comments.remove([comment.id]) }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function CommentRow(props: {
  comment: OpenComment
  onOpen: () => void
  onCopy: () => void
  targets: () => readonly TerminalTarget[]
  onSend: (target: TerminalTarget) => void
  onClose: () => void
}) {
  const { comment } = props
  const { name } = splitPath(comment.file)
  const lines = comment.toLine > comment.fromLine ? `${String(comment.fromLine)}-${String(comment.toLine)}` : String(comment.fromLine)
  return (
    <div className="dshWorkspaceThread">
      <button type="button" className="dshWorkspaceThreadWhere" title={comment.file} onClick={props.onOpen}>{name}:{lines}</button>
      {comment.lines[0] !== undefined && <code className="dshWorkspaceThreadLine">{comment.lines[0]}</code>}
      <p className="dshWorkspaceThreadText">{comment.text}</p>
      <div className="dshWorkspaceThreadActions">
        <button type="button" onClick={props.onCopy}>Copy</button>
        <SendMenu label="Send to" targets={props.targets} onChoose={props.onSend} />
        <button type="button" aria-label={`Close the comment on ${name}:${lines}`} title="Close without using it" onClick={props.onClose}>×</button>
      </div>
    </div>
  )
}

/** A button that lists the open terminals and agents when pressed; choosing one sends. The list is read when it opens. */
function SendMenu(props: { label: string, targets: () => readonly TerminalTarget[], onChoose: (target: TerminalTarget) => void }) {
  const [open, setOpen] = useState<readonly TerminalTarget[] | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (open === null) return
    const away = (event: PointerEvent): void => { if (!(event.target instanceof Node) || box.current?.contains(event.target) !== true) setOpen(null) }
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(null) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape) }
  }, [open])
  return (
    <span className="dshWorkspaceSendMenu" ref={box}>
      <button type="button" aria-haspopup="menu" aria-expanded={open !== null} onClick={() => { setOpen(open === null ? props.targets() : null) }}>{props.label} ▾</button>
      {open !== null && (
        <div className="dshWorkspaceSendMenuList" role="menu" aria-label={props.label}>
          {open.length === 0 && <p className="dshWorkspaceSendMenuEmpty">No terminal or agent is open. Start one from + or New terminal.</p>}
          {open.map(target => (
            <button key={target.terminalId} type="button" role="menuitem" onClick={() => { setOpen(null); props.onChoose(target) }}>
              <span className="dshWorkspaceSendMenuTitle">{target.title}</span>
              <span className="dshWorkspaceSendMenuWhere">{target.place === 'panel' ? `${target.worktreeLabel}, terminal panel` : target.worktreeLabel}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
