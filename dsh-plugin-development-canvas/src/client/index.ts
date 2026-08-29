import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ReactNode } from 'react'
import { DevelopmentCanvas } from './development-canvas/DevelopmentCanvas.tsx'
import { createCanvasPtyApi } from './development-canvas/pty-api.ts'
import { CanvasPtyClient } from './development-canvas/session-client.ts'
import { installCanvasStyles } from './styles.ts'

interface DesktopMainOwnerProps {
  renderConversation(): ReactNode
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'desktop.main': { kind: 'single'; scope: 'root'; owner: DesktopMainOwnerProps }
  }
}

export const name = 'development-canvas-client'
export const inject = ['slots']

/** Contribute Canvas only while the Desktop main slot declaration is live. */
export function apply(ctx: ClientContext): void {
  // `desktop.main` is declared only by the desktop's advanced shell. In
  // compatibility mode the slot is undeclared, so the inject would throw and
  // fail the whole client plugin tree ('Failed to load plugins'). Skip it
  // instead (the Canvas is an advanced-mode feature), and rethrow anything
  // that is not the undeclared-slot guard.
  try {
    ctx.slots.inject('desktop.main', () => {
      const ptyClient = new CanvasPtyClient(createCanvasPtyApi())
      const removeStyles = installCanvasStyles()
      const removeSlot = ctx.slots.register({
        name: 'desktop.main',
        priority: 0,
        inject: () => ({ ptyApi: ptyClient }),
      }, DevelopmentCanvas)

      return async () => {
        removeSlot()
        removeStyles()
        await ptyClient.dispose()
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('is not declared')) return
    throw error
  }
}

export { DevelopmentCanvas } from './development-canvas/DevelopmentCanvas.tsx'
export { CanvasPtyClient } from './development-canvas/session-client.ts'
export { DevelopmentCanvasState, normalizeBrowserUrl } from './development-canvas/state.ts'
