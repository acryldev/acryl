/**
 * One column of the local notes board. Cards are dragged with the browser's own drag and drop: pick one up,
 * drop it on a column to append, or on another card to place it just before that card. The move itself is
 * `WorkspaceState.moveCard`; this component only reports where the card was dropped.
 */

import { useState } from 'react'
import type { KanbanCard, KanbanColumnId } from '../canvas/state.ts'

export const NOTE_DRAG_TYPE = 'application/x-acryl-note'

export interface NoteColumnProps {
  readonly id: KanbanColumnId
  readonly title: string
  readonly cards: readonly KanbanCard[]
  /** A card was dropped here; `index` is where it goes (the card count when dropped on the column itself). */
  onDrop(cardId: string, column: KanbanColumnId, index: number): void
  /** Rendered under the cards (the add-a-note field). */
  readonly footer?: React.ReactNode
}

export function NoteColumn({ id, title, cards, onDrop, footer }: NoteColumnProps) {
  const [over, setOver] = useState(false)
  const accepts = (event: React.DragEvent): boolean => event.dataTransfer.types.includes(NOTE_DRAG_TYPE)
  const drop = (event: React.DragEvent, index: number): void => {
    if (!accepts(event)) return
    event.preventDefault()
    event.stopPropagation()
    setOver(false)
    const cardId = event.dataTransfer.getData(NOTE_DRAG_TYPE)
    if (cardId !== '') onDrop(cardId, id, index)
  }

  return (
    <div
      className="dshWorkspaceKanbanColumn"
      data-column={`note-${id}`}
      data-over={over || undefined}
      onDragOver={(event) => { if (accepts(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false) }}
      onDrop={(event) => { drop(event, cards.length) }}
    >
      <div className="dshWorkspaceKanbanColumnTitle">{title} <span className="dshWorkspaceKanbanCount">{cards.length}</span></div>
      <div className="dshWorkspaceKanbanCards">
        {cards.length === 0 && <div className="dshWorkspaceKanbanEmpty">Drop a note here</div>}
        {cards.map((card, index) => (
          <div
            key={card.id}
            className="dshWorkspaceKanbanCard"
            draggable
            data-note={card.id}
            onDragStart={(event) => {
              event.dataTransfer.setData(NOTE_DRAG_TYPE, card.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDrop={(event) => { drop(event, index) }}
          >
            {card.text}
          </div>
        ))}
      </div>
      {footer}
    </div>
  )
}
