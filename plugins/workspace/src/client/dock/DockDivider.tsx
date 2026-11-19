/** The draggable, keyboard-operable bar between the panel above and the terminal panel below. */

import type { KeyboardEvent, PointerEvent } from 'react'

export interface DockDividerProps {
  readonly label: string
  /** While dragging, the pointer's viewport Y; the owner turns it into a size. */
  onDragTo(clientY: number): void
  /** Arrow keys: -1 grows the terminal panel, +1 shrinks it. */
  onStep(direction: -1 | 1): void
  onReset(): void
  readonly valueNow: number
  readonly valueMin: number
  readonly valueMax: number
}

export function DockDivider({ label, onDragTo, onStep, onReset, valueNow, valueMin, valueMax }: DockDividerProps) {
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) onDragTo(event.clientY)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowUp') onStep(-1)
    else if (event.key === 'ArrowDown') onStep(1)
    else return
    event.preventDefault()
  }
  return (
    <div
      className="dshDockDivider"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      tabIndex={0}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={move}
      onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId) }}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  )
}
