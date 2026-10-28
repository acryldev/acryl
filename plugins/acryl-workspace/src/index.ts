/** Cordis Host plugin: ACRYL Workspace PTY table and loopback routes. */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-control'
import type { Acryl } from 'acrylblends'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import { agentRoutes } from './agents/route.ts'
import { AgentCatalog } from './agents/catalog.ts'
import { agentSettingsFile, agentsFile, createFileCatalogStore } from './agents/file-store.ts'
import { AgentSettings } from './agents/settings.ts'
import { AgentStatusStore, WORKSPACE_AGENT_STATUS_PATH } from './agents/status/agent-status.ts'
import { agentStatusRoutes } from './agents/status/route.ts'
import { capabilityRoutes } from './capabilities/route.ts'
import { filesRoutes } from './files/route.ts'
import { WorkspaceFiles, WorkspaceFilesError } from './files/service.ts'
import { pickFolderNatively, singleFlight } from './folder-picker/picker.ts'
import { pickFolderRoutes } from './folder-picker/route.ts'
import { gitRoutes } from './git/route.ts'
import { WorkspaceGit, WorkspaceGitError } from './git/service.ts'
import { WORKSPACE_API_PREFIX, privateApi } from './private-route.ts'
import { PROJECTS_NAMESPACE, ProjectRegistry, ProjectsSchema } from './projects/registry.ts'
import { createKeepAlive, projectRoutes } from './projects/route.ts'
import { registerWorkspaceTools } from './projects/tools.ts'
import { WORKSPACE_PTY_STREAM_PATH } from './pty/contract.ts'
import { spawnNodePty } from './pty/node-pty-spawn.ts'
import { ptyRoutes } from './pty/route.ts'
import { WorkspacePtyRegistry } from './pty/service.ts'
import { ptyStreamRoutes } from './pty/stream.ts'
import { registerChatContext, type SystemPromptContextPort } from './shared-context/chat.ts'
import { briefRoutes } from './shared-context/route.ts'
import { SHARED_CONTEXT_SERVICE, SharedContext } from './shared-context/service.ts'
import { registerContextTool } from './shared-context/tool.ts'

/** Stable Cordis plugin name. */
export const name = 'acryl-workspace'

/**
 * The part of the runtime's `appInstance` service ACRYL plugins read (a separated interface: plugins do not import the runtime). Every plugin declares
 * exactly this shape, so the Context augmentations agree in any program that loads several of them.
 */
interface AppInstanceService {
  readonly home: string
  readonly dshHome: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    appInstance: AppInstanceService
  }
}

/**
 * The routes, the terminal's WebSocket among them, are served by the router (`router`, `routerHttp`) under {@link WORKSPACE_API_PREFIX}. The
 * loopback Web server is still needed for its address (agent hooks report to it). The app instance says where this app keeps its data.
 */
export const inject = ['acrylWeb', 'appInstance', 'acrylSettings', 'router', 'routerHttp']

/**
 * Activate the workspace's Host half: its services and their routes. Disabling the Loader row unmounts the routes and kills leftover PTY sessions.
 * @param ctx - Host context for this generation.
 */
export function apply(ctx: Context): void {
  if (ctx.acrylWeb.host !== '127.0.0.1') {
    throw new Error('acryl-workspace: requires a loopback Web server')
  }
  const rendererOrigin = `http://127.0.0.1:${String(ctx.acrylWeb.port)}`
  const reportHostError = (operation: string, cause: unknown): void => {
    ctx.logger.error(
      `acryl-workspace: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  // The services and their routes are built in the effect; the terminal's sockets are taken and the app mounted after it, so on unload the
  // mount goes first (its requests end and are waited for), then the terminal sockets close with 1001, then the PTYs, git and the rest go.
  const built: { routes?: readonly Acryl[]; pty?: WorkspacePtyRegistry } = {}
  ctx.effect(() => {
    // The user's custom agents live in their ACRYL home; the registry asks the catalog what an id means.
    // The registry asks the settings what an id runs; the settings ask the catalog and the registry's own PATH search.
    let settings: AgentSettings | undefined
    // Agents that support hooks report working, waiting and done here; the secret is known only to their terminals.
    const statusToken = randomBytes(24).toString('hex')
    // An agent started in a Shared Context workspace gets its context; the service is set further down, once the registry exists.
    let sharedContext: SharedContext | undefined
    const workspacePty = new WorkspacePtyRegistry({
      spawn: spawnNodePty,
      agents: { resolve: id => settings?.resolve(id) },
      launchContext: { launchFor: (id, cwd) => sharedContext?.launchFor(id, cwd) },
      agentStatus: { url: `${rendererOrigin}${WORKSPACE_AGENT_STATUS_PATH}`, token: statusToken },
    })
    const agentStatus = new AgentStatusStore(id => workspacePty.has(id))
    const catalog = new AgentCatalog(createFileCatalogStore(agentsFile(ctx.appInstance.home)), command => workspacePty.canRun(command))
    const agentSettings = new AgentSettings(createFileCatalogStore(agentSettingsFile(ctx.appInstance.home)), catalog, command => workspacePty.canRun(command))
    settings = agentSettings
    void catalog.load().catch(reportHostError.bind(undefined, 'load custom agents'))
    void agentSettings.load().catch(reportHostError.bind(undefined, 'load agent settings'))
    const workspaceGit = new WorkspaceGit()
    const workspaceFiles = new WorkspaceFiles({
      // Only a git worktree root is a place the editor may touch; a failed check surfaces as a bad path.
      resolveWorktree: async (path) => {
        try {
          return await workspaceGit.worktreeRoot(path)
        } catch (cause) {
          if (cause instanceof WorkspaceGitError && cause.kind === 'invalid') throw new WorkspaceFilesError(cause.message, 'invalid')
          throw cause
        }
      },
      ignored: (root, paths) => workspaceGit.ignored(root, paths),
    })
    const releases: Array<() => void> = []
    try {
      // The project list is ACRYL's own: one section of the ACRYL home's settings, released with this plugin so a reloaded plugin registers it again.
      const projects = new ProjectRegistry(ctx.acrylSettings.register(PROJECTS_NAMESPACE, ProjectsSchema))
      // Shared context (spec 043 T009): the generated WORKSPACE.md of every Shared Context workspace stays current, and other plugins can read it.
      const shared = new SharedContext({ registry: projects, home: ctx.appInstance.home })
      sharedContext = shared
      releases.push(shared.start(cause => { reportHostError('write the shared workspace context', cause) }))
      const withdrawSharedContext = ctx.reflect.provide(SHARED_CONTEXT_SERVICE, shared)
      releases.push(() => { void withdrawSharedContext() })
      // The DSH chat in a Shared Context workspace is told about it (T010); present while the harness's system prompt service is.
      const contextFor = (folder: string): { readonly prompt: string } | undefined => sharedContext?.contextFor(folder)
      const chatContextFiber = ctx.inject(['systemPrompt'], (child) => {
        const systemPrompt = (child as unknown as { readonly systemPrompt: SystemPromptContextPort }).systemPrompt
        child.effect(() => registerChatContext(systemPrompt, contextFor), 'acryl-workspace: shared workspace context for the chat')
      })
      releases.push(() => { void chatContextFiber.dispose() })
      // The context for any agent through the tool registry and the gateway, and the agent's workspace tools (spec 043 T007); present while
      // ACRYL's tool port is.
      const contextToolFiber = ctx.inject(['acrylTools'], (child) => {
        child.effect(() => registerContextTool(child, { view: () => projects.view(), promptFor: id => sharedContext?.promptFor(id) }), 'acryl-workspace: workspace context tool')
      })
      releases.push(() => { void contextToolFiber.dispose() })
      const toolsFiber = ctx.inject(['acrylTools'], (child) => {
        child.effect(() => registerWorkspaceTools(child, projects), 'acryl-workspace: workspace agent tools')
      })
      releases.push(() => { void toolsFiber.dispose() })
      const keepAlive = createKeepAlive()
      releases.push(() => { keepAlive.stop() })
      // The chat is the DSH `agents` service; reading it per request, not injecting it, is what lets this plugin stay up when the chat is off.
      const services: { get(name: string): unknown } = ctx
      // The OS's own folder chooser, for the "+" on Web (a browser page cannot open one that yields a path).
      const pickFolder = singleFlight(() => pickFolderNatively(process.platform))
      built.pty = workspacePty
      built.routes = [
        ptyRoutes(workspacePty, reportHostError),
        agentRoutes(catalog, agentSettings, reportHostError),
        agentStatusRoutes(statusToken, agentStatus, reportHostError),
        capabilityRoutes(() => ({ chat: services.get('agents') !== undefined })),
        projectRoutes(projects, keepAlive, reportHostError),
        briefRoutes(shared),
        filesRoutes(workspaceFiles, reportHostError),
        gitRoutes(workspaceGit, reportHostError),
        pickFolderRoutes(pickFolder, reportHostError),
      ]
    } catch (cause) {
      for (const release of releases.reverse()) release()
      void workspaceGit.dispose()
      throw cause
    }
    return async () => {
      for (const release of releases.reverse()) release()
      await Promise.all([workspacePty.disposeAll(), workspaceGit.dispose()])
    }
  }, 'acryl-workspace: PTY table, git, files, projects and agents')
  if (built.routes === undefined || built.pty === undefined) throw new Error('acryl-workspace: the routes were not built')
  const upgrade = ctx.routerHttp.upgrades()
  // Removing the mount ends the requests still in flight, the project event streams among them.
  ctx.router.route('/', privateApi(...built.routes, ptyStreamRoutes(built.pty, upgrade, reportHostError)))
  ctx.routerHttp.mount(WORKSPACE_API_PREFIX, { upgrade: [WORKSPACE_PTY_STREAM_PATH] })
}

/** The agent's workspace tools, exported so the runtime can check their schemas against DSH's own compiler. */
export { registerWorkspaceTools } from './projects/tools.ts'
export { registerContextTool } from './shared-context/tool.ts'
