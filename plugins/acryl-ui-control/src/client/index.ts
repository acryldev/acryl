/**
 * Cordis Client plugin: the in-page half of Agent Control (spec 041).
 *
 * It runs the driver on this window's document, answers the Host's calls over the page channel, and shows the
 * "agent is driving" indicator with its kill switch in the shell's overlay. Nothing here is specific to Web or
 * Desktop: an Electron window and a browser tab run this same code.
 */

import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from 'acryl-workspace/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { PageChannel } from './connection.ts'
import { UiDriver } from './driver/driver.ts'
import { AgentDrivingIndicator } from './Indicator.tsx'
import { installIndicatorStyles } from './styles.ts'
import { UserInputClock } from './user-input.ts'

export const name = 'acryl-ui-control-client'
/** `slots` for the indicator. */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const clock = new UserInputClock()
  const driver = new UiDriver({ document: () => document, msSinceUserInput: clock.msSince })
  const windowId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `w-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
  const focused = (): boolean => document.visibilityState === 'visible' && document.hasFocus()

  ctx.effect(() => installIndicatorStyles(), 'acryl-ui-control: styles')

  ctx.effect(() => {
    const detachInput = clock.attach(document)
    const channel = new PageChannel(driver, { windowId, focused })
    const reportFocus = (): void => { channel.reportFocus(focused()) }
    window.addEventListener('focus', reportFocus)
    window.addEventListener('blur', reportFocus)
    document.addEventListener('visibilitychange', reportFocus)
    channel.connect()
    return () => {
      window.removeEventListener('focus', reportFocus)
      window.removeEventListener('blur', reportFocus)
      document.removeEventListener('visibilitychange', reportFocus)
      channel.dispose()
      detachInput()
      // Pending calls settle as `unloaded` and every ref goes stale.
      driver.dispose()
    }
  }, 'acryl-ui-control: page channel and driver')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'acryl-ui-control-indicator',
    order: 1000,
    inject: () => ({ driver }),
  }, AgentDrivingIndicator))
}

export { UiDriver } from './driver/driver.ts'
export { AgentDrivingIndicator } from './Indicator.tsx'
export { PageChannel } from './connection.ts'
