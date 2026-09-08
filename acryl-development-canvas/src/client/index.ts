import type { Context as ClientContext } from '@deepseek-ai/cordis'
// `ctx.slots`'s `Context` augmentation now lives in `dsh-client-ui-renderer`
// (split out of `dsh-client-ui-slots`'s pure core in the v0.1.5-alpha.1
// "extract Store and renderer Slot infrastructure" refactor). Importing a
// real type from it (rather than an empty `import type {}`, which some
// compilations drop entirely) reliably pulls its ambient `declare module`
// augmentation into this program even though nothing here holds a value of it.
import type { UiRendererService as _UiRendererService } from '@deepseek-ai/dsh-client-ui-renderer/client'
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
