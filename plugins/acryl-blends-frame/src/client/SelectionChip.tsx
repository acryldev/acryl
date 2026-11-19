/**
 * The chip inside the chat composer for the element picked in the app (docs/design/blends-frame-mockup.html, scenario 2): "Selected: ..." at the
 * left of the input row, the person's placeholder after it. DSH has no slot on the input row itself, so the chip rides its `conversation.input.overlay`
 * seat inside the composer card, and the frame moves the editor and its placeholder right by the chip's width while the pick is there. The context
 * reaches the agent on the next message through the send hook, which writes the element's page and selector into the draft at the moment the
 * composer sends, so the person's own text stays exactly as they typed it.
 */

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { SelectedElement } from './selection.ts'

export interface SelectionChipInjected {
  readonly selection: {
    get(): SelectedElement | undefined
    subscribe(listener: () => void): () => void
  }
  clear(): void
  /** Hand the pick to the frame's Host just before the person's own send; the message itself is sent untouched. */
  send(): void
  /** Return the keyboard to the composer, the way the frame's feedback hand-off does. */
  focus(): void
}

export type SelectionChipProps = SelectionChipInjected

/** The mockup's gap between the chip and the input text. */
export const CHIP_GAP = 8
/** The custom property the editor carries while a chip is shown: the first line's indent (./styles.ts reads it). */
export const CHIP_INSET_PROPERTY = '--acrylBlendsChipInset'

/** Where the chip sits inside the composer card, and how far the draft's text moves right to make room for it. */
export interface ChipGeometry {
  /** The chip's left, in the overlay anchor's coordinates. */
  readonly left: number
  /** The chip's top, in the overlay anchor's coordinates. */
  readonly top: number
  /** The editor's and placeholder's left inset while the chip is shown. */
  readonly textInset: number
}

/**
 * The chip's box and the draft's inset for one layout.
 * @param editor - the contenteditable's box, in viewport coordinates.
 * @param anchor - the composer's overlay anchor (the chip's containing block), in viewport coordinates.
 * @param chip - the chip's size.
 * @param lineHeight - the editor's line height.
 * @param paddingLeft - the editor's left pad before the chip.
 * @param paddingTop - the editor's top pad before the chip.
 * @returns the chip's position and the draft's new left inset; the chip is vertically centered on the first line.
 */
export function chipGeometry(
  editor: { readonly left: number; readonly top: number },
  anchor: { readonly left: number; readonly top: number },
  chip: { readonly width: number; readonly height: number },
  lineHeight: number,
  paddingLeft: number,
  paddingTop: number,
): ChipGeometry {
  return {
    left: editor.left - anchor.left + paddingLeft,
    top: editor.top - anchor.top + paddingTop + Math.max(0, (lineHeight - chip.height) / 2),
    textInset: paddingLeft + chip.width + CHIP_GAP,
  }
}

/**
 * Whether one DOM event is a send gesture of the chat composer. Only the composer card counts, so the rest of the page keeps its own keys
 * and clicks; an open trigger menu owns Enter because the person is picking a reference or a command, not sending.
 */
export function isSendGesture(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (event.type === 'keydown') {
    const key = event as KeyboardEvent
    if (key.key !== 'Enter' || key.isComposing || key.shiftKey || key.altKey || (key.metaKey && key.ctrlKey)) return false
    const card = target.closest('[data-composer-card]')
    return card !== null && card.querySelector('[data-trigger-menu]') === null
  }
  if (event.type === 'click') {
    const button = target.closest('button')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false
    const card = button.closest('[data-composer-card]')
    if (card === null) return false
    // The primary action is the card's last button: Send, or Stop while a draft is empty (the send hook leaves that draft alone).
    const buttons = card.querySelectorAll('button')
    return buttons[buttons.length - 1] === button
  }
  return false
}

export function SelectionChip({ selection, clear, send, focus }: SelectionChipProps) {
  const current = useSyncExternalStore(selection.subscribe, selection.get, selection.get)
  const chip = useRef<HTMLSpanElement | null>(null)
  // A new pick is the person asking the chat about that element: the composer takes the keyboard, as the mockup's next message does.
  useEffect(() => {
    if (current !== undefined) focus()
  }, [current?.selector, current?.page, focus])
  useEffect(() => {
    if (current === undefined) return undefined
    const onGesture = (event: Event): void => { if (isSendGesture(event)) send() }
    window.addEventListener('keydown', onGesture, true)
    window.addEventListener('click', onGesture, true)
    return () => {
      window.removeEventListener('keydown', onGesture, true)
      window.removeEventListener('click', onGesture, true)
    }
  }, [current?.selector, current?.page, send])
  // The chip is not a child of the editor, so the text makes room for it: the first line of the draft is indented by the chip's width (the
  // lines under it keep the full width), the placeholder moves with it, and the chip is placed on the first line. Layout follows the card
  // while the draft grows or the window resizes.
  useLayoutEffect(() => {
    if (current === undefined) return undefined
    const element = chip.current
    const wrapper = element?.parentElement
    const anchor = wrapper?.parentElement
    const card = element?.closest('[data-composer-card]')
    const editor = card?.querySelector<HTMLElement>('[data-composer-input]')
    if (element === null || element === undefined || anchor === null || anchor === undefined || editor === null || editor === undefined) return undefined
    // The base geometry is read once: every later placement adds to the same pads instead of reading back its own inset and compounding it.
    const initial = getComputedStyle(editor)
    const basePaddingLeft = Number.parseFloat(initial.paddingLeft) || 0
    const basePaddingTop = Number.parseFloat(initial.paddingTop) || 0
    const lineHeight = Number.parseFloat(initial.lineHeight) || 24
    // The placeholder is rendered only while the draft is empty, so it is found again on every placement and a new one still lines up.
    let placeholder: HTMLElement | undefined
    const place = (): void => {
      const geometry = chipGeometry(
        editor.getBoundingClientRect(),
        anchor.getBoundingClientRect(),
        element.getBoundingClientRect(),
        lineHeight,
        basePaddingLeft,
        basePaddingTop,
      )
      element.style.left = `${String(geometry.left)}px`
      element.style.top = `${String(geometry.top)}px`
      editor.style.setProperty(CHIP_INSET_PROPERTY, `${String(geometry.textInset - basePaddingLeft)}px`)
      placeholder = editor.nextElementSibling instanceof HTMLElement ? editor.nextElementSibling : undefined
      if (placeholder !== undefined) placeholder.style.left = `${String(geometry.textInset)}px`
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    observer?.observe(editor)
    observer?.observe(element)
    observer?.observe(card as HTMLElement)
    const grow = editor.parentElement
    const mutations = typeof MutationObserver === 'undefined' || grow === null ? undefined : new MutationObserver(place)
    if (grow !== null) mutations?.observe(grow, { childList: true })
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      mutations?.disconnect()
      window.removeEventListener('resize', place)
      editor.style.removeProperty(CHIP_INSET_PROPERTY)
      if (placeholder !== undefined) placeholder.style.left = ''
    }
  }, [current?.selector, current?.page, current?.label])
  if (current === undefined) return null
  return (
    <span ref={chip} className="acrylBlendsSelectionChip" title={current.selector}>
      <span className="acrylBlendsSelectionChipLabel">Selected: {current.label}</span>
      <button
        type="button"
        className="acrylBlendsSelectionChipClear"
        aria-label="Clear selection"
        title="Clear selection"
        onClick={clear}
      >
        ×
      </button>
    </span>
  )
}
