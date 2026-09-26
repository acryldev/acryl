// `ctx.slots`'s `Context` augmentation lives in `dsh-client-ui-renderer` (split out of
// `dsh-client-ui-slots`'s pure core). Importing a real type from it (rather than an empty
// `import type {}`, which some compilations drop entirely) reliably pulls its ambient
// `declare module` augmentation into this program even though nothing here holds a value of it.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Pulls the shell's slot declarations (`desktop.main`, `desktop.sidebar`, `rightbar`, ...) and the `ctx.layout`
// augmentation into every program that imports this package's types.
import type {} from './shell/contracts.ts'
import { applyAdvancedShell } from './shell/advanced-shell.ts'
import { resolveShellEnvironment } from './shell/environment.ts'
import { createAgentBridge } from './sessions/agent-bridge.ts'
import { createSessionNavigator } from './sessions/session-navigator.ts'
import { createWorkspaceFilesApi } from './files/files-api.ts'
import { filesTabPlugin } from './files/files-tab.ts'
import { changesTabPlugin } from './changes/changes-tab.ts'
import { checksTabPlugin } from './checks/checks-tab.ts'
import { parseSavedThreads, REVIEW_STORAGE_KEY, ReviewStore, startReviewPersistence } from './review/review-store.ts'
import { reviewTabPlugin } from './review/review-tab.ts'
import { WorkspaceGroups } from './canvas/groups.ts'
import { browserStorage, parseSavedWorkspace, STORAGE_KEY } from './canvas/persistence.ts'
import { startWorkspacePersistence } from './canvas/persist.ts'
import { createProjectsControl, desktopDirectorySeams } from './projects/projects-control.ts'
import { createWorkspaceGitApi } from './git/git-api.ts'
import { ProjectsSidebar } from './projects/ProjectsSidebar.tsx'
import { createWorkspacePtyApi } from './terminal/pty-api.ts'
import { WorkspacePtyClient } from './sessions/session-client.ts'
import { createWorkspaceAgentsApi } from './agents/agents-api.ts'
import { AgentsState } from './agents/agents-state.ts'
import { createBrowserNoticePort } from './notifications/system-notice.ts'
import { ToastState } from './notifications/toast-state.ts'
import { TerminalRegistry } from './terminal/terminal-session.ts'
import { startShellPolling } from './worktrees/shell-polling.ts'
import { WorkspaceShellState } from './worktrees/shell-state.ts'
import { installWorkspaceStyles } from './styles.ts'
import { WorkspaceCanvas } from './canvas/WorkspaceCanvas.tsx'

/**
 * Slot priority for the Workspace canvas. Lower renders. The older `acryl-development-canvas`
 * market plugin registers `desktop.main` at 0, and a single slot throws on a second registration at
 * the same priority, which failed this whole plugin. -1 shadows it deliberately: the Workspace is
 * its successor, and disabling either plugin leaves the other working.
 */
export const WORKSPACE_MAIN_PRIORITY = -1

export const name = 'acryl-workspace-client'
// `theme` is read by the shell's theme presenter; Cordis rejects reading a service a plugin did not declare.
export const inject = ['slots', 'theme']

/**
 * The ACRYL shell and workspace, identical on Web and Desktop. In the advanced shell this plugin owns the
 * frame (`shell/`) and contributes the tile canvas to `desktop.main` and the Chats | Projects left pane to
 * `desktop.sidebar`, ahead of the defaults (priority 100; lower wins for a `single` slot). Desktop's
 * compatibility mode keeps the stock frame, so only the right-panel tabs are registered there. One shell
 * state feeds every pane and is refreshed by one owned polling effect.
 */
export function apply(ctx: ClientContext): void {
  const environment = resolveShellEnvironment(window.location.hash)
  const advanced = environment.mode === 'advanced'
  if (advanced) applyAdvancedShell(ctx, environment)
  const gitApi = createWorkspaceGitApi()
  const filesApi = createWorkspaceFilesApi()
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
  const sessionNavigator = createSessionNavigator(() => ctx.get('sessions'))
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
    platform: environment.platform,
    shell,
    gitApi,
    getWorkspaces: () => ctx.get('workspaces'),
    getSessions: () => ctx.get('sessions'),
    directory: () => desktopDirectorySeams(),
  })
  ctx.effect(() => startShellPolling(shell), 'acryl-workspace: git state polling')
  ctx.effect(() => installWorkspaceStyles(), 'acryl-workspace: styles')
  ctx.plugin(changesTabPlugin(shell, gitApi))
  ctx.plugin(reviewTabPlugin(shell, review))
  ctx.plugin(checksTabPlugin(shell, gitApi))
  ctx.plugin(filesTabPlugin(shell, filesApi, gitApi))

  if (advanced) {
    // Shared by the "+" menu, the tab icons and the Projects list.
    const agents = new AgentsState(createWorkspaceAgentsApi())
    ctx.effect(() => { void agents.refresh(); return () => {} }, 'acryl-workspace: load custom agents')
    ctx.slots.inject('desktop.main', () => {
      const ptyClient = new WorkspacePtyClient(createWorkspacePtyApi())
      // Terminals live as long as this registration, so switching tabs never rebuilds one.
      const terminals = new TerminalRegistry()
      const toasts = new ToastState()
      const notices = createBrowserNoticePort()
      let removeSlot: (() => void) | undefined
      try {
        removeSlot = ctx.slots.register({
          name: 'desktop.main',
          priority: WORKSPACE_MAIN_PRIORITY,
          inject: () => ({ ptyApi: ptyClient, terminals, agents, toasts, notices, shell, groups, gitApi, filesApi, agent, sessionNavigator, review, rightPanel }),
        }, WorkspaceCanvas)
      } catch (cause) {
        // A registration conflict must not take the left pane and the Changes tab down with it.
        ctx.logger.warn(`acryl-workspace: could not register the canvas: ${cause instanceof Error ? cause.message : String(cause)}`)
      }

      return async () => {
        removeSlot?.()
        terminals.disposeAll()
        await ptyClient.dispose()
      }
    })

    ctx.slots.inject('desktop.sidebar', () => {
      try {
        return ctx.slots.register({
          name: 'desktop.sidebar',
          priority: 0,
          inject: () => ({ shell, projects, groups, agents }),
        }, ProjectsSidebar)
      } catch (cause) {
        ctx.logger.warn(`acryl-workspace: could not register the left pane: ${cause instanceof Error ? cause.message : String(cause)}`)
        return () => {}
      }
    })
  }
}

export { WorkspaceCanvas } from './canvas/WorkspaceCanvas.tsx'
export { ProjectsSidebar } from './projects/ProjectsSidebar.tsx'
export { WorkspaceShellState } from './worktrees/shell-state.ts'
export { WorkspacePtyClient } from './sessions/session-client.ts'
export { WorkspaceState, normalizeBrowserUrl } from './canvas/state.ts'
