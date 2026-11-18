/** The centre: the app's own page in one frame. A navigation or a reload mounts a NEW frame; a frame is never re-pointed (section 30). */

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { SelectedElement } from '../selection.ts'
import type { AppCanvasState } from './app-canvas.ts'
import { attachPicker, markSelected } from './picker.ts'

export interface AppCanvasProps {
  readonly canvas: AppCanvasState
  /** The frame's select control is on: clicks in the app pick an element instead of acting on the app. */
  readonly picking?: boolean
  /** One element was picked. */
  readonly onPick?: (element: SelectedElement) => void
  /** Escape left the picker. */
  readonly onCancel?: () => void
  /** The pick belongs to a page the canvas no longer shows: the frame lets the selection go with it. */
  readonly onStaleSelection?: () => void
  /** The element the chat has selected: outlined while it is on the page shown. */
  readonly selected?: SelectedElement | undefined
}

/** The page a loaded app document shows; undefined while the frame is still the browser's initial about:blank. */
export function appPage(doc: { readonly location: { readonly href: string; readonly pathname: string; readonly search: string } }): string | undefined {
  return doc.location.href === 'about:blank' || doc.location.href === '' ? undefined : doc.location.pathname + doc.location.search
}

export function AppCanvas({ canvas, picking = false, onPick, onCancel, onStaleSelection, selected }: AppCanvasProps) {
  const snapshot = useSyncExternalStore(
    (listener) => canvas.subscribe(listener),
    () => canvas.getSnapshot(),
  )
  const frame = useRef<HTMLIFrameElement | null>(null)
  // The handlers are read at the event, so a new callback identity never tears the picker down and re-attaches it.
  const handlers = useRef({ onPick, onCancel, onStaleSelection })
  handlers.current = { onPick, onCancel, onStaleSelection }
  // The service reads the live page through the frame the component rendered. Laid out before paint so `pageWindow` answers as soon as the
  // document it is asked about is the one on screen.
  useLayoutEffect(() => {
    canvas.attach(frame.current)
    return () => canvas.attach(null)
  }, [canvas, snapshot.address, snapshot.attempt])
  useEffect(() => () => canvas.attach(null), [canvas])
  // A picker belongs to one document: a load (`snapshot.loaded`) or a new frame (address, attempt) attaches it again to the page now shown.
  useEffect(() => {
    if (!picking || snapshot.address === undefined) return undefined
    const doc = frame.current?.contentDocument
    if (doc === null || doc === undefined) return undefined
    return attachPicker(doc, {
      onPick: (element) => { handlers.current.onPick?.(element) },
      onCancel: () => { handlers.current.onCancel?.() },
    })
  }, [picking, snapshot.address, snapshot.attempt, snapshot.loaded])
  // The selection stays outlined on the page it was picked on; a page the app navigated to takes the pick with it, chip and all.
  useEffect(() => {
    if (selected === undefined || snapshot.address === undefined) return undefined
    const doc = frame.current?.contentDocument
    if (doc === null || doc === undefined) return undefined
    const page = appPage(doc)
    // The frame is still about:blank: the app has not loaded, so nothing is known yet about the page it will show.
    if (page === undefined) return undefined
    if (page !== selected.page) {
      handlers.current.onStaleSelection?.()
      return undefined
    }
    if (picking) return undefined
    return markSelected(doc, selected.selector)
  }, [picking, selected, snapshot.address, snapshot.attempt, snapshot.loaded])
  if (snapshot.address === undefined) return null
  return (
    <iframe
      // The address and the attempt are both part of the key: a change mounts a new frame instead of pointing this one somewhere else.
      key={`${String(snapshot.attempt)} ${snapshot.address}`}
      ref={frame}
      className="acrylAppCanvasFrame"
      title="App"
      // The feedback screenshot in Preview asks the browser for the tab; the embedded app page may do so.
      allow="display-capture"
      src={snapshot.address}
      onLoad={(event) => {
        const address = snapshot.address
        if (address === undefined) return
        canvas.reportLoad(address, event.currentTarget.contentDocument !== null)
      }}
    />
  )
}
