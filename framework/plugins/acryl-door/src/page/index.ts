/**
 * The door's page module (`main.ts` starts it; `<script type="module" src="/api/acryl-door/page.js"></script>` loads that). It drives this
 * page's document for the agent (snapshots with refs, clicks, typing), answers the Host over the channel, and shows the indicator with
 * the kill switch. It touches only this document, never another window and never the OS.
 */

import { appBaseOf, underAppBase } from './base.ts'
import { PageChannel } from './channel.ts'
import { UiDriver } from './driver/driver.ts'
import { mountIndicator } from './indicator.ts'
import { mountOutlines } from './outline.ts'
import { UserInputClock } from './user-input.ts'

export const DOOR_BASE = '/api/acryl-door'

/** The key on the page's `window` under which the door publishes `{ windowId }`: the agent panel in the same page sends it with a question, and the door drives that page for the run. */
export const PAGE_KEY = Symbol.for('acryl.door.page')

/** Where the page keeps its tab's id: per tab, kept across reloads and moves within the app, never shared with another tab. */
const TAB_KEY = 'acryl-door-tab'

/**
 * This tab's id: the page that replaces this one in the same tab (a reload, a move to another path) says the same, so the Host keeps driving that tab for a run asked from it.
 * `undefined` when the browser keeps no session storage.
 */
function tabOf(view: Window): string | undefined {
  try {
    const kept = view.sessionStorage.getItem(TAB_KEY)
    if (kept !== null && /^[A-Za-z0-9-]{8,80}$/u.test(kept)) return kept
    const made = typeof view.crypto?.randomUUID === 'function' ? view.crypto.randomUUID() : undefined
    if (made === undefined) return undefined
    view.sessionStorage.setItem(TAB_KEY, made)
    return made
  } catch {
    return undefined
  }
}

/** Start the door on `document`. @returns the disposer. */
export function startDoor(document: Document, base: string = DOOR_BASE): () => void {
  const view = document.defaultView
  if (view === null) throw new Error('acryl-door: the document has no window')
  const clock = new UserInputClock()
  const appBase = appBaseOf(document)
  // The ring on whatever the agent touches, drawn in this page (the frame's canvas and production's assistant both get it).
  const outlines = mountOutlines(document)
  const driver = new UiDriver({
    document: () => document,
    msSinceUserInput: clock.msSince,
    touched: (element) => { outlines.touched(element) },
    // A host that serves the app under a prefix (the ACRYL frame's canvas) marks its pages: an app path navigates under that prefix, so the same
    // `act navigate --path /board` reaches the app's /board in the frame and on the app's own server.
    ...(appBase === '' ? {} : {
      leave: (to: { readonly reload: true } | { readonly path: string }): void => {
        if ('reload' in to) view.location.reload()
        else view.location.assign(underAppBase(appBase, to.path))
      },
    }),
  })
  const windowId = typeof view.crypto?.randomUUID === 'function' ? view.crypto.randomUUID() : `w-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
  Object.defineProperty(view, PAGE_KEY, { value: Object.freeze({ windowId }), configurable: true })
  const tab = tabOf(view)
  const focused = (): boolean => document.visibilityState === 'visible' && document.hasFocus()
  const detachInput = clock.attach(document)
  const removeIndicator = mountIndicator(driver, document)
  const shellWindow = Number(/\bAcrylWindow\/(\d{1,9})\b/u.exec(view.navigator?.userAgent ?? '')?.[1])
  // `localStorage.setItem('acryl-door-transport', 'stream')` keeps this browser to the event stream (to compare, or behind a proxy that cannot upgrade).
  const transport = ((): 'auto' | 'stream' => {
    try {
      return view.localStorage.getItem('acryl-door-transport') === 'stream' ? 'stream' : 'auto'
    } catch {
      return 'auto'
    }
  })()
  const channel = new PageChannel(driver, { windowId, ...(tab === undefined ? {} : { tab }), focused, base, transport, onRun: running => { driver.setRunning(running) }, ...(Number.isSafeInteger(shellWindow) && shellWindow > 0 ? { shellWindow } : {}) })
  const reportFocus = (): void => { channel.reportFocus(focused()) }
  view.addEventListener('focus', reportFocus)
  view.addEventListener('blur', reportFocus)
  // A page that is left may be kept by the browser (back/forward cache) with its stream open, and six open streams hold up every request of the live page: let go on the way out.
  const leave = (): void => { channel.suspend() }
  const back = (event: Event): void => { if ((event as PageTransitionEvent).persisted) channel.resume() }
  view.addEventListener('pagehide', leave)
  view.addEventListener('pageshow', back)
  document.addEventListener('visibilitychange', reportFocus)
  channel.connect()
  return () => {
    view.removeEventListener('focus', reportFocus)
    view.removeEventListener('blur', reportFocus)
    view.removeEventListener('pagehide', leave)
    view.removeEventListener('pageshow', back)
    document.removeEventListener('visibilitychange', reportFocus)
    Reflect.deleteProperty(view, PAGE_KEY)
    channel.dispose()
    removeIndicator()
    outlines.dispose()
    detachInput()
    // Pending calls settle as `unloaded` and every ref goes stale.
    driver.dispose()
  }
}
