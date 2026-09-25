/** Right pane tab: the line comments sent to the agent for the selected worktree, with resolve tracking. */

import { useCallback, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { splitPath } from '../changes/ChangesBody.tsx'
import type { ReviewStore, ReviewThread } from './review-store.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'

export type ReviewBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  readonly shell: WorkspaceShellState
  readonly review: ReviewStore
}

export function ReviewBody({ shell, review }: ReviewBodyProps) {
  const subscribeShell = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const subscribeReview = useCallback((listener: () => void) => review.subscribe(listener), [review])
  useSyncExternalStore(subscribeShell, () => shell.getSnapshot())
  useSyncExternalStore(subscribeReview, () => review.getVersion())
  const worktree = shell.selectedWorktree()

  if (worktree === undefined) {
    return (
      <div className="dshWorkspaceReview" data-empty>
        <p className="dshWorkspaceChangesEmpty">Select a worktree in the Projects list to see its review comments.</p>
      </div>
    )
  }

  const threads = review.forWorktree(worktree.path)
  const open = threads.filter(thread => !thread.resolved)
  const done = threads.filter(thread => thread.resolved)
  return (
    <div className="dshWorkspaceReview">
      <header className="dshWorkspaceChangesHead">
        <div className="dshWorkspaceChangesTitle">
          <strong>{worktree.branch ?? 'detached'}</strong>
          <span className="dshWorkspaceChangesMeta">
            {open.length} open, {done.length} resolved
          </span>
        </div>
      </header>
      {threads.length === 0 && (
        <p className="dshWorkspaceChangesEmpty">
          No comments yet. Open a file from Changes and press + beside a line to comment for the agent.
        </p>
      )}
      <ul className="dshWorkspaceThreadList">
        {[...open, ...done].map(thread => (
          <li key={thread.id}>
            <Thread
              thread={thread}
              onOpen={() => { shell.openDiff({ worktree: thread.worktree, file: thread.file }) }}
              onResolved={resolved => { review.setResolved(thread.id, resolved) }}
              onRemove={() => { review.remove(thread.id) }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Thread(props: {
  thread: ReviewThread
  onOpen: () => void
  onResolved: (resolved: boolean) => void
  onRemove: () => void
}) {
  const { thread } = props
  const { name } = splitPath(thread.file)
  return (
    <div className="dshWorkspaceThread" data-resolved={thread.resolved || undefined}>
      <button type="button" className="dshWorkspaceThreadWhere" title={thread.file} onClick={props.onOpen}>
        {name}:{thread.line}
        <span className="dshWorkspaceThreadSide">{thread.side === 'new' ? 'new' : 'old'}</span>
      </button>
      <code className="dshWorkspaceThreadLine">{thread.lineText}</code>
      <p className="dshWorkspaceThreadText">{thread.comment}</p>
      <div className="dshWorkspaceThreadActions">
        <button type="button" onClick={() => { props.onResolved(!thread.resolved) }}>
          {thread.resolved ? 'Reopen' : 'Resolve'}
        </button>
        <button type="button" aria-label="Remove comment" onClick={props.onRemove}>Remove</button>
      </div>
    </div>
  )
}
