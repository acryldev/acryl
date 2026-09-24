// `ctx.slots`'s `Context` augmentation lives in `dsh-client-ui-renderer` (split out of
// `dsh-client-ui-slots`'s pure core). Importing a real type from it (rather than an empty
// `import type {}`, which some compilations drop entirely) reliably pulls its ambient
// `declare module` augmentation into this program even though nothing here holds a value of it.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { createWorkspaceGitApi } from './workspace/git-api.ts'
import { ProjectsSidebar, type ProjectsSidebarOwnerProps } from './workspace/ProjectsSidebar.tsx'
import { createWorkspacePtyApi } from './workspace/pty-api.ts'
import { WorkspacePtyClient } from './workspace/session-client.ts'
import { startShellPolling } from './workspace/shell-polling.ts'
import { WorkspaceShellState } from './workspace/shell-state.ts'
import { installWorkspaceStyles } from './workspace/styles.ts'
import { WorkspaceCanvas } from './workspace/WorkspaceCanvas.tsx'

interface DesktopMainOwnerProps {
  renderConversation(): ReactNode
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'desktop.main': { kind: 'single'; scope: 'root'; owner: DesktopMainOwnerProps }
    'desktop.sidebar': { kind: 'single'; scope: 'root'; owner: ProjectsSidebarOwnerProps }
  }
}

export const name = 'acryl-workspace-client'
export const inject = ['slots']

/**
 * Run a slot contribution only while its slot declaration is live. `desktop.main` and
 * `desktop.sidebar` are declared only by the desktop's advanced shell. In compatibility mode (and
 * on Web) they are undeclared, so the inject would throw and fail the whole client plugin tree
 * ('Failed to load plugins'). Skip instead - the Workspace is an advanced-mode feature - and
 * rethrow anything that is not the undeclared-slot guard.
 */
function whenSlotDeclared(contribute: () => void): void {
  try {
    contribute()
  } catch (error) {
    if (error instanceof Error && error.message.includes('is not declared')) return
    throw error
  }
}

/**
 * Contribute the Workspace to the advanced shell: the tile canvas in `desktop.main` and the
 * Chats | Projects left pane in `desktop.sidebar`, both at priority 0 so they win over the
 * defaults (priority 100; lower wins for a `single` slot). One shell state feeds every pane and is
 * refreshed by one owned polling effect.
 */
export function apply(ctx: ClientContext): void {
  const shell = new WorkspaceShellState(createWorkspaceGitApi())
  ctx.effect(() => startShellPolling(shell), 'acryl-workspace: git state polling')
  ctx.effect(() => installWorkspaceStyles(), 'acryl-workspace: styles')

  whenSlotDeclared(() => {
    ctx.slots.inject('desktop.main', () => {
      const ptyClient = new WorkspacePtyClient(createWorkspacePtyApi())
      const removeSlot = ctx.slots.register({
        name: 'desktop.main',
        priority: 0,
        inject: () => ({ ptyApi: ptyClient }),
      }, WorkspaceCanvas)

      return async () => {
        removeSlot()
        await ptyClient.dispose()
      }
    })
  })

  whenSlotDeclared(() => {
    ctx.slots.inject('desktop.sidebar', () => ctx.slots.register({
      name: 'desktop.sidebar',
      priority: 0,
      inject: () => ({ shell }),
    }, ProjectsSidebar))
  })
}

export { WorkspaceCanvas } from './workspace/WorkspaceCanvas.tsx'
export { ProjectsSidebar } from './workspace/ProjectsSidebar.tsx'
export { WorkspaceShellState } from './workspace/shell-state.ts'
export { WorkspacePtyClient } from './workspace/session-client.ts'
export { WorkspaceState, normalizeBrowserUrl } from './workspace/state.ts'
