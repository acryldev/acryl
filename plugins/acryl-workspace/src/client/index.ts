// `ctx.slots`'s `Context` augmentation lives in `dsh-client-ui-renderer` (split out of
// `dsh-client-ui-slots`'s pure core). Importing a real type from it (rather than an empty
// `import type {}`, which some compilations drop entirely) reliably pulls its ambient
// `declare module` augmentation into this program even though nothing here holds a value of it.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { createWorkspacePtyApi } from './workspace/pty-api.ts'
import { WorkspacePtyClient } from './workspace/session-client.ts'
import { installWorkspaceStyles } from './workspace/styles.ts'
import { WorkspaceCanvas } from './workspace/WorkspaceCanvas.tsx'

interface DesktopMainOwnerProps {
  renderConversation(): ReactNode
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'desktop.main': { kind: 'single'; scope: 'root'; owner: DesktopMainOwnerProps }
  }
}

export const name = 'acryl-workspace-client'
export const inject = ['slots']

/**
 * Contribute the Workspace tile canvas at priority 0 - the same priority the reference
 * `acryl-development-canvas` plugin used to win over `DefaultDesktopMain` (priority 100; lower
 * wins for a `single` slot) - only while the Desktop main slot declaration is live.
 * `desktop.main` is declared only by the desktop's advanced shell. In compatibility mode the slot
 * is undeclared, so the inject would throw and fail the whole client plugin tree ('Failed to load
 * plugins'). Skip it instead (the Workspace canvas is an advanced-mode feature), and rethrow
 * anything that is not the undeclared-slot guard.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.slots.inject('desktop.main', () => {
      const ptyClient = new WorkspacePtyClient(createWorkspacePtyApi())
      const removeStyles = installWorkspaceStyles()
      const removeSlot = ctx.slots.register({
        name: 'desktop.main',
        priority: 0,
        inject: () => ({ ptyApi: ptyClient }),
      }, WorkspaceCanvas)

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

export { WorkspaceCanvas } from './workspace/WorkspaceCanvas.tsx'
export { WorkspacePtyClient } from './workspace/session-client.ts'
export { WorkspaceState, normalizeBrowserUrl } from './workspace/state.ts'
