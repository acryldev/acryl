/**
 * The Kanban tile: one card per chat, in the column that says what its agent is doing (Ready, Running, Done),
 * updated live from the session list, plus three local note columns (To do, Doing, Done) whose cards are dragged between columns.
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { UseSessions } from '@acryl/ui/frame'
import type { KanbanBoard, KanbanColumnId, WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import type { SessionNavigator } from '../sessions/session-navigator.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { NoteColumn } from './NoteColumn.tsx'
import { buildSessionBoard, type BoardSession } from './board-model.ts'

export interface SessionBoardPaneProps {
  readonly tile: WorkspaceTile
  readonly workspace: WorkspaceState
  readonly shell: WorkspaceShellState
  readonly useSessions: UseSessions
  readonly navigator: SessionNavigator
}

function ago(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${String(hours)}h ago` : `${String(Math.round(hours / 24))}d ago`
}

const EMPTY_NOTES: KanbanBoard = { todo: [], doing: [], done: [] }
const NOTE_COLUMNS: readonly { readonly id: KanbanColumnId; readonly title: string }[] = [
  { id: 'todo', title: 'Notes - To do' },
  { id: 'doing', title: 'Notes - Doing' },
  { id: 'done', title: 'Notes - Done' },
]

export function SessionBoardPane({ tile, workspace, shell, useSessions, navigator }: SessionBoardPaneProps) {
  const list = useSessions(state => state)
  const subscribe = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const repos = useSyncExternalStore(subscribe, () => shell.getSnapshot().repos)
  const [note, setNote] = useState('')
  const rows: BoardSession[] = list.ids.flatMap((id) => {
    const row = list.byId[id]
    if (row === undefined) return []
    return [{ id, running: row.running, blank: row.blank, updatedAt: row.updatedAt, ...(row.cwd === undefined ? {} : { cwd: row.cwd }), ...(row.origin === undefined ? {} : { origin: row.origin }) }]
  })
  const columns = buildSessionBoard(rows, repos)
  const now = Date.now()
  const board = tile.board ?? EMPTY_NOTES

  return (
    <div className="dshWorkspaceKanban" aria-label="Chats by what their agent is doing">
      {columns.map(column => (
        <div key={column.id} className="dshWorkspaceKanbanColumn" data-column={column.id}>
          <div className="dshWorkspaceKanbanColumnTitle">{column.label} <span className="dshWorkspaceKanbanCount">{column.cards.length}</span></div>
          <div className="dshWorkspaceKanbanCards">
            {column.cards.length === 0 && <div className="dshWorkspaceKanbanEmpty">No chats</div>}
            {column.cards.map(card => (
              <button
                key={card.sessionId}
                type="button"
                className="dshWorkspaceKanbanCard dshWorkspaceKanbanSessionCard"
                data-running={column.id === 'running' || undefined}
                onClick={() => { navigator.open(card.sessionId) }}
              >
                <span className="dshWorkspaceKanbanBranch">{card.branch ?? 'no worktree'}</span>
                <span className="dshWorkspaceKanbanMeta">{card.sessionId.slice(0, 8)} - {ago(card.updatedAt, now)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {NOTE_COLUMNS.map(column => (
        <NoteColumn
          key={column.id}
          id={column.id}
          title={column.title}
          cards={board[column.id]}
          onDrop={(cardId, target, index) => { workspace.moveCard(tile.id, cardId, target, index) }}
          footer={column.id === 'todo' && (
            <form
              className="dshWorkspaceKanbanAdd"
              onSubmit={(event) => {
                event.preventDefault()
                workspace.addCard(tile.id, 'todo', note)
                setNote('')
              }}
            >
              <input aria-label="Add a note" placeholder="Add a note..." value={note} onChange={(event) => { setNote(event.target.value) }} />
            </form>
          )}
        />
      ))}
    </div>
  )
}
