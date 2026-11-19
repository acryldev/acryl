import { useCallback, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { clampSplit, ratioFromPointer, SPLIT_KEY_STEP, SPLIT_MAX, SPLIT_MIN } from './split-ratio.ts'

export interface SplitDividerProps {
  /** The stage the two panes live in; its box turns pointer positions into a ratio. */
  readonly stage: RefObject<HTMLElement | null>
  readonly ratio: number
  readonly onRatio: (ratio: number) => void
}

/** The draggable, keyboard-operable bar between the primary and the split pane. */
export function SplitDivider({ stage, ratio, onRatio }: SplitDividerProps) {
  const move = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = stage.current?.getBoundingClientRect()
    if (box === undefined) return
    onRatio(ratioFromPointer(event.clientX, box.left, box.width))
  }, [stage, onRatio])

  const key = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') onRatio(clampSplit(ratio - SPLIT_KEY_STEP))
    else if (event.key === 'ArrowRight') onRatio(clampSplit(ratio + SPLIT_KEY_STEP))
    else return
    event.preventDefault()
  }

  return (
    <div
      className="dshWorkspaceDivider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the split"
      aria-valuemin={Math.round(SPLIT_MIN * 100)}
      aria-valuemax={Math.round(SPLIT_MAX * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={move}
      onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId) }}
      onDoubleClick={() => { onRatio(0.5) }}
      onKeyDown={key}
    />
  )
}
