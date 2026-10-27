/**
 * The door's page module (`main.ts` starts it; `<script type="module" src="/api/acryl-door/page.js"></script>` loads that). It drives this
 * page's document for the agent (snapshots with refs, clicks, typing), answers the Host over the channel, and shows the indicator with
 * the kill switch. It touches only this document, never another window and never the OS.
 */

import { PageChannel } from './channel.ts'
import { UiDriver } from './driver/driver.ts'
import { mountIndicator } from './indicator.ts'
import { UserInputClock } from './user-input.ts'

export const DOOR_BASE = '/api/acryl-door'

/** Start the door on `document`. @returns the disposer. */
export function startDoor(document: Document, base: string = DOOR_BASE): () => void {
  const view = document.defaultView
  if (view === null) throw new Error('acryl-door: the document has no window')
  const clock = new UserInputClock()
  const driver = new UiDriver({ document: () => document, msSinceUserInput: clock.msSince })
  const windowId = typeof view.crypto?.randomUUID === 'function' ? view.crypto.randomUUID() : `w-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
  const focused = (): boolean => document.visibilityState === 'visible' && document.hasFocus()
  const detachInput = clock.attach(document)
  const removeIndicator = mountIndicator(driver, document)
  const channel = new PageChannel(driver, { windowId, focused, base })
  const reportFocus = (): void => { channel.reportFocus(focused()) }
  view.addEventListener('focus', reportFocus)
  view.addEventListener('blur', reportFocus)
  document.addEventListener('visibilitychange', reportFocus)
  channel.connect()
  return () => {
    view.removeEventListener('focus', reportFocus)
    view.removeEventListener('blur', reportFocus)
    document.removeEventListener('visibilitychange', reportFocus)
    channel.dispose()
    removeIndicator()
    detachInput()
    // Pending calls settle as `unloaded` and every ref goes stale.
    driver.dispose()
  }
}
