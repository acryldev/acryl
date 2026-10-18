// `ctx.slots`'s `Context` augmentation lives in `dsh-client-ui-renderer` (split out of
// `dsh-client-ui-slots`'s pure core). Importing a real type from it (rather than an empty
// `import type {}`, which some compilations drop entirely) reliably pulls its ambient
// `declare module` augmentation into this program even though nothing here holds a value of it.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Pulls the shell's slot declarations (`desktop.main`, `desktop.sidebar`, `rightbar`, ...) and the `ctx.layout`
// augmentation into every program that imports this package's types. Plain side-effect import, not
// `import type {}`, for the same reason as the two imports above: this package has no runtime exports, so an
// empty `import type {}` is erased under `verbatimModuleSyntax` and the augmentation never reaches consumers.
import 'acryl-app-shell/client'
import { applyAdvancedShell, resolveShellEnvironment } from 'acryl-app-shell/client'
import { dockShellHooks } from './dock/dock-hooks.tsx'
import { createAgentBridge } from './sessions/agent-bridge.ts'
import { ChatSelection } from './chat/chat-selection.ts'
import type { MainViewNavigation } from './sessions/main-session.ts'
import { createWorkspaceFilesApi } from './files/files-api.ts'
import { filesTabPlugin } from './files/files-tab.ts'
import { changesTabPlugin } from './changes/changes-tab.ts'
import { checksTabPlugin } from './checks/checks-tab.ts'
import { parseSavedThreads, REVIEW_STORAGE_KEY, ReviewStore, startReviewPersistence } from './review/review-store.ts'
import { reviewTabPlugin } from './review/review-tab.ts'
import { COMMENTS_STORAGE_KEY, CommentStore, parseSavedComments, startCommentPersistence } from './comments/comment-store.ts'
import { commentsTabPlugin } from './comments/comments-tab.ts'
import { listTerminalTargets } from './comments/terminal-targets.ts'
import { browserClipboard } from './comments/use-comments.ts'
import { WorkspaceState } from './canvas/state.ts'
import { WorkspaceGroups } from './canvas/groups.ts'
import { browserStorage, parseSavedWorkspace, STORAGE_KEY } from './canvas/persistence.ts'
import { startWorkspacePersistence } from './canvas/persist.ts'
import { createWebFolderPicker } from './projects/web-folder-picker.ts'
import { createProjectRegistryApi, followProjectRegistry } from './projects/registry-api.ts'
import { followShownWorkspace } from './projects/shown-workspace.ts'
import { createBriefApi } from './shared-context/brief-api.ts'
import { briefTabType } from './shared-context/BriefTab.tsx'
import { adoptLegacyProjects, ProjectRegistryState } from './projects/registry-state.ts'
import { createProjectsControl, desktopDirectorySeams } from './projects/projects-control.ts'
import { createWorkspaceGitApi } from './git/git-api.ts'
import { ProjectsSidebar } from './projects/ProjectsSidebar.tsx'
import { createUpstreamPanels, type PanelSlotRegistry } from './projects/upstream-panels.ts'
import { DEFAULT_WORKSPACE_CAPABILITIES, loadWorkspaceCapabilities } from './capabilities/capabilities-api.ts'
import { createWorkspaceAgentsApi } from './agents/agents-api.ts'
import { agentsSettingsPlugin } from './agents/agents-settings-plugin.ts'
import { settingsSharedPlugin } from './settings/section-plugin.ts'
import { PaletteConfigState } from './palette/palette-config.ts'
import { paletteSettingsPlugin } from './palette/palette-settings-plugin.ts'
import { createAgentStatusApi } from './status/agent-status-api.ts'
import { AgentStatusState } from './status/agent-status-state.ts'
import { createTerminalStack } from './dock/terminal-stack.ts'
import { WorkspaceTabRegistry } from './tabs/registry/tab-registry.ts'
import { provideWorkspaceTabs } from './tabs/registry/provide.ts'
import { TabTypesState } from './tabs/tab-types-state.ts'
import { tabsSettingsPlugin } from './tabs/tabs-settings-plugin.ts'
import { AgentsState } from './agents/agents-state.ts'
import { createBrowserNoticePort } from './notifications/system-notice.ts'
import { ToastState } from './notifications/toast-state.ts'
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
  const gitApi = createWorkspaceGitApi()
  const filesApi = createWorkspaceFilesApi()
  // Restore what a previous run saved, then keep saving. Bad or missing data simply means a fresh start.
  const storage = browserStorage()
  const saved = parseSavedWorkspace(storage?.getItem(STORAGE_KEY) ?? null)
  const shell = new WorkspaceShellState(gitApi, saved?.forgottenRoots, saved?.dismissedChats)
  // What the Host composition offers (the DSH chat may be off). Everything that depends on it is registered once it is known; until then the
  // page shows the stock frame for the instant it takes, and an unreachable Host means "everything", as before.
  let capabilities = DEFAULT_WORKSPACE_CAPABILITIES
  const capabilitiesLoaded = loadWorkspaceCapabilities().then((loaded) => { capabilities = loaded })
  const groups = new WorkspaceGroups(() => new WorkspaceState({ chat: capabilities.chat }), saved?.groups)
  if (saved !== undefined) shell.setMode(saved.mode)
  // The terminals and the dock are shared by the frame (which places the dock) and the canvas (its terminal tabs).
  const terminalStack = advanced ? createTerminalStack(ctx, storage, shell) : undefined
  const frame = advanced ? applyAdvancedShell(ctx, environment, dockShellHooks(terminalStack?.host)) : undefined
  ctx.effect(() => startWorkspacePersistence({ groups, shell, storage }), 'acryl-workspace: save tabs and view')
  const review = new ReviewStore(parseSavedThreads(storage?.getItem(REVIEW_STORAGE_KEY) ?? null))
  ctx.effect(() => startReviewPersistence(review, storage), 'acryl-workspace: save review comments')
  const comments = new CommentStore(parseSavedComments(storage?.getItem(COMMENTS_STORAGE_KEY) ?? null))
  ctx.effect(() => startCommentPersistence(comments, storage), 'acryl-workspace: save line comments')
  const agent = createAgentBridge(() => ctx.get('sessions'))
  // DSH's session navigation (`dsh-client-ui-workspace`), looked up when a chat is opened: ACRYL does not import that package (the
  // frame facade stays as it is), so the service is read by name through the narrow port `main-session.ts` declares.
  const getNavigation = (): MainViewNavigation | undefined => (ctx.get as (name: string) => MainViewNavigation | undefined)('uiWorkspace')
  // The one owner of which chat is shown and which tab and worktree show it; follows DSH's sessions service as it comes and goes.
  const chats = new ChatSelection({ groups, shell, getSessions: () => ctx.get('sessions'), getNavigation, showTabs: () => { upstreamPanels.close() } })
  ctx.inject(['sessions'], child => { child.effect(() => chats.watch(child.sessions), 'acryl-workspace: tabs follow the shown chat') })
  const rightPanel = {
    toggle(): void {
      try {
        ctx.get('sidebarRight')?.toggleExpanded()
      } catch {
        // No current chat session means there is no right panel to toggle.
      }
    },
    isOpen(): boolean {
      if (frame !== undefined) return frame.rightPanel.isShown()
      try {
        return ctx.get('sidebarRight')?.isExpanded() === true
      } catch {
        return false
      }
    },
    subscribe(listener: () => void): () => void {
      return frame?.rightPanel.subscribe(listener) ?? (() => {})
    },
  }
  const projectRegistry = new ProjectRegistryState(createProjectRegistryApi())
  ctx.effect(() => { void projectRegistry.load(); return () => {} }, 'acryl-workspace: read the project list')
  // Changes made elsewhere (an agent's workspace tool, another window) arrive through the Host's event stream.
  ctx.effect(() => followProjectRegistry(view => { projectRegistry.receive(view) }), 'acryl-workspace: follow the project list')
  // Projects that were chat workspaces before ACRYL owned the list are taken over once, when the chat's workspace list is known.
  ctx.inject(['workspaces'], child => { child.effect(() => adoptLegacyProjects(projectRegistry, child.workspaces.list), 'acryl-workspace: take over earlier projects') })
  const projects = createProjectsControl({
    registry: projectRegistry,
    platform: environment.platform,
    shell,
    gitApi,
    getWorkspaces: () => ctx.get('workspaces'),
    getSessions: () => ctx.get('sessions'),
    navigator: chats,
    directory: () => desktopDirectorySeams(),
    chatAvailable: () => capabilities.chat,
    webPickDirectory: createWebFolderPicker(),
  })
  // Whoever changes the shown workspace (the strip, a new workspace, an agent's tool, another window), its tab sets and its worktree follow.
  ctx.effect(() => followShownWorkspace({
    registry: projectRegistry,
    groups,
    shell,
    showWorktree: (path) => { chats.showWorktree(path, () => { void projects.showChat(path) }) },
  }), 'acryl-workspace: the shown workspace')
  // DSH's own pages (Plugins, Automation tasks, ...) listed in the left pane: looked up when read, so a profile without them just shows none.
  // The `sidebar.panellist` slot name is declared by DSH's sidebar package, which ACRYL does not import (the frame facade stays as it is), so the registry crosses
  // into the narrow `PanelSlotRegistry` port here, at the one place that knows; the port, its tests and the live check hold the contract.
  const upstreamPanels = createUpstreamPanels({ slots: () => ctx.slots as unknown as PanelSlotRegistry, layout: () => ctx.get('layout') })
  ctx.effect(() => startShellPolling(shell), 'acryl-workspace: git state polling')
  ctx.effect(() => installWorkspaceStyles(), 'acryl-workspace: styles')
  ctx.plugin(changesTabPlugin(shell, gitApi))
  ctx.plugin(reviewTabPlugin(shell, review))
  ctx.plugin(checksTabPlugin(shell, gitApi))
  ctx.plugin(filesTabPlugin(shell, filesApi, gitApi, advanced))

  if (advanced && terminalStack !== undefined) {
    const { ptyClient, terminals, dock } = terminalStack
    // Line comments are kept until the user copies them or sends them into one of these terminals.
    ctx.plugin(commentsTabPlugin(shell, comments, {
      list: worktree => listTerminalTargets({ groups, dock, terminals, shell }, worktree),
      pasteTarget: terminalId => terminals.get(terminalId),
      reveal: (target) => {
        if (target.place === 'tab' && target.tabId !== undefined) {
          shell.select(target.worktree)
          chats.selectTab(target.worktree, target.tabId)
        }
        requestAnimationFrame(() => { terminals.get(target.terminalId)?.focus() })
      },
    }, browserClipboard()))
    // What terminal agents report through their hooks: the attention queue reads it.
    const agentStatus = new AgentStatusState(createAgentStatusApi())
    ctx.effect(() => agentStatus.start(), 'acryl-workspace: agent status polling')
    // Shared by the "+" menu, the tab icons and the Projects list.
    const agents = new AgentsState(createWorkspaceAgentsApi())
    ctx.effect(() => { void agents.refresh(); return () => {} }, 'acryl-workspace: load agents')
    // Shared by the + menu, the palette and Settings, so a change in one shows up in the others at once.
    const tabTypes = new TabTypesState(storage)
    // Plugins add tab types through this service; it lives as long as this plugin, and so do the types they registered.
    const tabRegistry = new WorkspaceTabRegistry()
    ctx.effect(() => provideWorkspaceTabs(ctx, tabRegistry), 'acryl-workspace: workspaceTabs service')
    // The workspace brief (spec 043 T011): a tab type of the workspace's own, through the same registry plugins use.
    ctx.effect(() => tabRegistry.register(briefTabType({ api: createBriefApi(), current: () => projectRegistry.current(), workspaces: () => projectRegistry.workspaces() })), 'acryl-workspace: workspace brief tab')
    const paletteConfig = new PaletteConfigState(storage)
    ctx.plugin(settingsSharedPlugin())
    ctx.plugin(agentsSettingsPlugin(agents))
    ctx.plugin(tabsSettingsPlugin(tabTypes, tabRegistry))
    ctx.plugin(paletteSettingsPlugin(paletteConfig))
    ctx.slots.inject('desktop.main', () => {
      const toasts = new ToastState()
      const notices = createBrowserNoticePort()
      let removeSlot: (() => void) | undefined
      let cancelled = false
      // Registered once the Host has said what it offers, so the first canvas already knows whether there is a chat.
      void capabilitiesLoaded.then(() => {
        if (cancelled) return
        try {
          removeSlot = ctx.slots.register({
            name: 'desktop.main',
            priority: WORKSPACE_MAIN_PRIORITY,
            inject: () => ({ ptyApi: ptyClient, terminals, dock, agentStatus, agents, tabTypes, tabRegistry, paletteConfig, toasts, notices, shell, groups, gitApi, filesApi, agent, chats, review, comments, rightPanel, projects }),
          }, WorkspaceCanvas)
        } catch (cause) {
          // A registration conflict must not take the left pane and the Changes tab down with it.
          ctx.logger.warn(`acryl-workspace: could not register the canvas: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      })

      return () => { cancelled = true; removeSlot?.() }
    })

    ctx.slots.inject('desktop.sidebar', () => {
      let removeSlot: (() => void) | undefined
      let cancelled = false
      void capabilitiesLoaded.then(() => {
        if (cancelled) return
        try {
          removeSlot = ctx.slots.register({
            name: 'desktop.sidebar',
            priority: 0,
            inject: () => ({ shell, projects, chats, groups, agents, status: agentStatus, panels: upstreamPanels }),
          }, ProjectsSidebar)
        } catch (cause) {
          ctx.logger.warn(`acryl-workspace: could not register the left pane: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      })
      return () => { cancelled = true; removeSlot?.() }
    })
  }
}

export { WorkspaceCanvas } from './canvas/WorkspaceCanvas.tsx'
export { ProjectsSidebar } from './projects/ProjectsSidebar.tsx'
export { WorkspaceShellState } from './worktrees/shell-state.ts'
export { WorkspacePtyClient } from './sessions/session-client.ts'
export { WorkspaceState, normalizeBrowserUrl } from './canvas/state.ts'
// The tab-type contract other plugins build against (and the `workspaceTabs` Context augmentation that comes with it).
export { provideWorkspaceTabs } from './tabs/registry/provide.ts'
export type { WorkspaceTabProps, WorkspaceTabType } from './tabs/registry/tab-registry.ts'
