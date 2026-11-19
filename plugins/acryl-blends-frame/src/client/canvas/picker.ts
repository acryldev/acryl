/**
 * The frame's element picker over the app canvas (docs/design/blends-frame-mockup.html, scenario 2). The app's page is same-origin under
 * `/app`, so the frame reads and decorates the app's own document: the element under the pointer is outlined, a click picks it and does
 * nothing else, and Escape leaves the picker.
 */

import { elementLabel, selectedElement, type SelectedElement } from '../selection.ts'

export interface CanvasPickerHandlers {
  /** One element was clicked while picking. */
  onPick(element: SelectedElement): void
  /** Escape left the picker; the frame turns its select control off. */
  onCancel(): void
}

/**
 * Attach the picker to one app document.
 * @param doc - the app page's document, same-origin with the frame.
 * @param handlers - what a click and Escape mean to the frame.
 * @returns a disposer that removes every listener and the outline, and restores the app's cursor.
 */
export function attachPicker(doc: Document, handlers: CanvasPickerHandlers): () => void {
  const body = doc.body
  const view = doc.defaultView
  if (body === null || view === null) return () => {}
  const page = doc.location.pathname + doc.location.search

  // A tag of its own: the outline sits in the app's body, and an app element's `:nth-of-type` selector must not count it.
  const outline = doc.createElement('acryl-picker-outline')
  outline.setAttribute('data-acryl-picker-outline', '')
  Object.assign(outline.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '2147483647',
    boxSizing: 'border-box',
    border: '2px dashed #e0a43a',
    borderRadius: '6px',
    background: 'rgba(224, 164, 58, 0.08)',
  })
  const name = doc.createElement('span')
  Object.assign(name.style, {
    position: 'absolute',
    right: '4px',
    top: '-22px',
    maxWidth: '320px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '1px 7px',
    borderRadius: '4px',
    background: '#e0a43a',
    color: '#1d1c1a',
    fontSize: '11px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  })
  outline.append(name)
  body.append(outline)

  const cursor = body.style.cursor
  body.style.cursor = 'crosshair'

  const hide = (): void => { outline.style.display = 'none' }

  const place = (target: Element, label: string): void => {
    const box = target.getBoundingClientRect()
    Object.assign(outline.style, {
      display: 'block',
      left: `${String(box.left - 3)}px`,
      top: `${String(box.top - 3)}px`,
      width: `${String(box.width + 6)}px`,
      height: `${String(box.height + 6)}px`,
    })
    // An element at the top of the page would put the label under the frame's own controls (the Select button and its hint, about 40px): below it,
    // or inside it when the page bottom is near.
    name.style.top = box.top < 60 ? (box.bottom < view.innerHeight - 24 ? 'calc(100% + 2px)' : '2px') : '-22px'
    name.textContent = label
  }

  const onMove = (event: PointerEvent): void => {
    const target = event.target
    // The app's nodes belong to the iframe's window, so the check uses that window's constructor, not the frame's.
    if (!(target instanceof view.Element) || target === doc.documentElement || outline.contains(target)) {
      hide()
      return
    }
    place(target, elementLabel(target))
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof view.Element) || target === doc.documentElement) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    hide()
    handlers.onPick(selectedElement(target, page))
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    hide()
    handlers.onCancel()
  }

  const onLeave = (): void => { hide() }

  doc.addEventListener('pointermove', onMove, true)
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('keydown', onKey, true)
  doc.documentElement?.addEventListener('pointerleave', onLeave, true)

  return () => {
    doc.removeEventListener('pointermove', onMove, true)
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('keydown', onKey, true)
    doc.documentElement?.removeEventListener('pointerleave', onLeave, true)
    outline.remove()
    body.style.cursor = cursor
  }
}

/**
 * Mark the element the chat has selected (scenario 2: the picked card stays outlined while it is the selection). The mark follows the element as the
 * page scrolls or resizes, and is gone when the element is.
 * @param doc - the app page's document.
 * @param selector - the selection's selector ({@link SelectedElement.selector}).
 * @returns a disposer that removes the mark and its listeners.
 */
export function markSelected(doc: Document, selector: string): () => void {
  const body = doc.body
  const view = doc.defaultView
  if (body === null || view === null) return () => {}
  const mark = doc.createElement('acryl-selected-outline')
  mark.setAttribute('data-acryl-selected-outline', '')
  Object.assign(mark.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '2147483646',
    boxSizing: 'border-box',
    border: '2px solid #5b6cff',
    borderRadius: '8px',
  })
  body.append(mark)
  let frame = 0
  const place = (): void => {
    frame = 0
    let target: Element | null = null
    try {
      target = doc.querySelector(selector)
    } catch {
      target = null
    }
    if (target === null) {
      mark.style.display = 'none'
      return
    }
    const box = target.getBoundingClientRect()
    Object.assign(mark.style, {
      display: 'block',
      left: `${String(box.left - 2)}px`,
      top: `${String(box.top - 2)}px`,
      width: `${String(box.width + 4)}px`,
      height: `${String(box.height + 4)}px`,
    })
  }
  const schedule = (): void => { if (frame === 0) frame = view.requestAnimationFrame(place) }
  place()
  view.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule)
  return () => {
    if (frame !== 0) view.cancelAnimationFrame(frame)
    view.removeEventListener('scroll', schedule, true)
    view.removeEventListener('resize', schedule)
    mark.remove()
  }
}
