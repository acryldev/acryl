// `ctx.slots`'s `Context` augmentation lives in `dsh-client-ui-renderer` (split out of
// `dsh-client-ui-slots`'s pure core). Importing a real type from it (rather than an empty
// `import type {}`, which some compilations drop entirely) reliably pulls its ambient
// `declare module` augmentation into this program even though nothing here holds a value of it.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { createAgentBridge } from './workspace/agent-bridge.ts'
import { changesTabPlugin } from './workspace/changes-tab.ts'
import { checksTabPlugin } from './workspace/checks-tab.ts'
import { parseSavedThreads, REVIEW_STORAGE_KEY, ReviewStore, startReviewPersistence } from './workspace/review-store.ts'
import { reviewTabPlugin } from './workspace/review-tab.ts'
import { WorkspaceGroups } from './workspace/groups.ts'
import { browserStorage, parseSavedWorkspace, STORAGE_KEY } from './workspace/persistence.ts'
import { startWorkspacePersistence } from './workspace/persist.ts'
import { createProjectsControl, desktopDirectorySeams } from './workspace/projects-control.ts'
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

/**
 * Slot priority for the Workspace canvas. Lower renders. The older `acryl-development-canvas`
 * market plugin registers `desktop.main` at 0, and a single slot throws on a second registration at
 * the same priority, which failed this whole plugin. -1 shadows it deliberately: the Workspace is
 * its successor, and disabling either plugin leaves the other working.
 */
export const WORKSPACE_MAIN_PRIORITY = -1

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
  const gitApi = createWorkspaceGitApi()
  const shell = new WorkspaceShellState(gitApi)
  // Restore what a previous run saved, then keep saving. Bad or missing data simply means a fresh start.
  const storage = browserStorage()
  const saved = parseSavedWorkspace(storage?.getItem(STORAGE_KEY) ?? null)
  const groups = new WorkspaceGroups(undefined, saved?.groups)
  if (saved !== undefined) shell.setMode(saved.mode)
  ctx.effect(() => startWorkspacePersistence({ groups, shell, storage }), 'acryl-workspace: save tabs and view')
  const review = new ReviewStore(parseSavedThreads(storage?.getItem(REVIEW_STORAGE_KEY) ?? null))
  ctx.effect(() => startReviewPersistence(review, storage), 'acryl-workspace: save review comments')
  const agent = createAgentBridge(() => ctx.get('sessions'))
  const rightPanel = {
    toggle(): void {
      try {
        ctx.get('sidebarRight')?.toggleExpanded()
      } catch {
        // No current chat session means there is no right panel to toggle.
      }
    },
  }
  const projects = createProjectsControl({
    shell,
    gitApi,
    getWorkspaces: () => ctx.get('workspaces'),
    getSessions: () => ctx.get('sessions'),
    directory: () => desktopDirectorySeams(),
  })
  ctx.effect(() => startShellPolling(shell), 'acryl-workspace: git state polling')
  ctx.effect(() => installWorkspaceStyles(), 'acryl-workspace: styles')
  ctx.plugin(changesTabPlugin(shell))
  ctx.plugin(reviewTabPlugin(shell, review))
  ctx.plugin(checksTabPlugin(shell, gitApi))

  whenSlotDeclared(() => {
    ctx.slots.inject('desktop.main', () => {
      const ptyClient = new WorkspacePtyClient(createWorkspacePtyApi())
      let removeSlot: (() => void) | undefined
      try {
        removeSlot = ctx.slots.register({
          name: 'desktop.main',
          priority: WORKSPACE_MAIN_PRIORITY,
          inject: () => ({ ptyApi: ptyClient, shell, groups, gitApi, agent, review, rightPanel }),
        }, WorkspaceCanvas)
      } catch (cause) {
        // A registration conflict must not take the left pane and the Changes tab down with it.
        ctx.logger.warn(`acryl-workspace: could not register the canvas: ${cause instanceof Error ? cause.message : String(cause)}`)
      }

      return async () => {
        removeSlot?.()
        await ptyClient.dispose()
      }
    })
  })

  whenSlotDeclared(() => {
    ctx.slots.inject('desktop.sidebar', () => {
      try {
        return ctx.slots.register({
          name: 'desktop.sidebar',
          priority: 0,
          inject: () => ({ shell, projects }),
        }, ProjectsSidebar)
      } catch (cause) {
        ctx.logger.warn(`acryl-workspace: could not register the left pane: ${cause instanceof Error ? cause.message : String(cause)}`)
        return () => {}
      }
    })
  })
}

export { WorkspaceCanvas } from './workspace/WorkspaceCanvas.tsx'
export { ProjectsSidebar } from './workspace/ProjectsSidebar.tsx'
export { WorkspaceShellState } from './workspace/shell-state.ts'
export { WorkspacePtyClient } from './workspace/session-client.ts'
export { WorkspaceState, normalizeBrowserUrl } from './workspace/state.ts'
