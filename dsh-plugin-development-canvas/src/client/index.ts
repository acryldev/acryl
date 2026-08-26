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
}

export { DevelopmentCanvas } from './development-canvas/DevelopmentCanvas.tsx'
export { CanvasPtyClient } from './development-canvas/session-client.ts'
export { DevelopmentCanvasState, normalizeBrowserUrl } from './development-canvas/state.ts'
