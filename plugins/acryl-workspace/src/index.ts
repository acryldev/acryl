/** Cordis Host plugin: ACRYL Workspace PTY table and loopback routes. */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-control'
import {
  WORKSPACE_FILES_ENTRY_PATH,
  WORKSPACE_FILES_READ_PATH,
  WORKSPACE_FILES_TREE_PATH,
  WORKSPACE_FILES_WRITE_PATH,
} from './files/contract.ts'
import {
  handleWorkspaceFilesEntryRequest,
  handleWorkspaceFilesReadRequest,
  handleWorkspaceFilesTreeRequest,
  handleWorkspaceFilesWriteRequest,
} from './files/route.ts'
import { WorkspaceFiles, WorkspaceFilesError } from './files/service.ts'
import { WorkspaceGit, WorkspaceGitError } from './git/service.ts'
import {
  WORKSPACE_GIT_CHECKS_PATH,
  WORKSPACE_GIT_COMMIT_PATH,
  WORKSPACE_GIT_DIFF_PATH,
  WORKSPACE_GIT_REPO_PATH,
  WORKSPACE_GIT_SEARCH_PATH,
  WORKSPACE_GIT_STAGE_PATH,
  WORKSPACE_GIT_STATUS_PATH,
  WORKSPACE_GIT_UNSTAGE_PATH,
  WORKSPACE_GIT_WORKTREE_PATH,
} from './git/contract.ts'
import {
  handleWorkspaceGitChecksRequest,
  handleWorkspaceGitCommitRequest,
  handleWorkspaceGitDiffRequest,
  handleWorkspaceGitRepoRequest,
  handleWorkspaceGitSearchRequest,
  handleWorkspaceGitStageRequest,
  handleWorkspaceGitStatusRequest,
  handleWorkspaceGitUnstageRequest,
  handleWorkspaceGitWorktreeRequest,
} from './git/route.ts'
import { WORKSPACE_CAPABILITIES_PATH } from './capabilities/contract.ts'
import { WORKSPACE_PROJECTS_PATH } from './projects/contract.ts'
import { PROJECTS_NAMESPACE, ProjectRegistry, ProjectsSchema } from './projects/registry.ts'
import { handleProjectsRequest } from './projects/route.ts'
import { handleWorkspaceCapabilitiesRequest } from './capabilities/route.ts'
import { AgentCatalog } from './agents/catalog.ts'
import { WORKSPACE_AGENT_SETTINGS_PATH, WORKSPACE_AGENTS_PATH, WORKSPACE_AGENTS_REMOVE_PATH } from './agents/contract.ts'
import { agentSettingsFile, agentsFile, createFileCatalogStore } from './agents/file-store.ts'
import { handleWorkspaceAgentSettingsRequest, handleWorkspaceAgentsRemoveRequest, handleWorkspaceAgentsRequest } from './agents/route.ts'
import { AgentSettings } from './agents/settings.ts'
import { AgentStatusStore, WORKSPACE_AGENT_STATUS_PATH } from './agents/status/agent-status.ts'
import { handleAgentStatusRequest } from './agents/status/route.ts'
import { spawnNodePty } from './pty/node-pty-spawn.ts'
import { WORKSPACE_PICK_FOLDER_PATH } from './folder-picker/contract.ts'
import { pickFolderNatively, singleFlight } from './folder-picker/picker.ts'
import { handleWorkspacePickFolderRequest } from './folder-picker/route.ts'
import { WorkspacePtyRegistry } from './pty/service.ts'
import {
  WORKSPACE_PTY_CLOSE_PATH,
  WORKSPACE_PTY_INPUT_PATH,
  WORKSPACE_PTY_PATH,
  WORKSPACE_PTY_RESIZE_PATH,
  WORKSPACE_PTY_STREAM_PATH,
} from './pty/contract.ts'
import {
  handleWorkspacePtyCloseRequest,
  handleWorkspacePtyInputRequest,
  handleWorkspacePtyRequest,
  handleWorkspacePtyResizeRequest,
} from './pty/route.ts'
import { createWorkspacePtyStream } from './pty/stream.ts'

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

/** Loopback Web server required to publish canvas routes; the app instance says where this app keeps its data. */
export const inject = ['acrylWeb', 'appInstance', 'acrylSettings']

/**
 * Activate Development Canvas as a neighboring, required Host plugin.
 * Disable the Loader row to unload routes and kill leftover PTY sessions.
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
  ctx.effect(() => {
    // The user's custom agents live in their ACRYL home; the registry asks the catalog what an id means.
    // The registry asks the settings what an id runs; the settings ask the catalog and the registry's own PATH search.
    let settings: AgentSettings | undefined
    // Agents that support hooks report working, waiting and done here; the secret is known only to their terminals.
    const statusToken = randomBytes(24).toString('hex')
    const workspacePty = new WorkspacePtyRegistry({
      spawn: spawnNodePty,
      agents: { resolve: id => settings?.resolve(id) },
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
    })
    const releases: Array<() => void> = []
    try {
      const ptyRoutes = [
        [WORKSPACE_PTY_PATH, handleWorkspacePtyRequest],
        [WORKSPACE_PTY_INPUT_PATH, handleWorkspacePtyInputRequest],
        [WORKSPACE_PTY_RESIZE_PATH, handleWorkspacePtyResizeRequest],
        [WORKSPACE_PTY_CLOSE_PATH, handleWorkspacePtyCloseRequest],
      ] as const
      for (const [path, handler] of ptyRoutes) {
        releases.push(ctx.acrylWeb.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, workspacePty, reportHostError),
        }))
      }
      const ptyStream = createWorkspacePtyStream(workspacePty, rendererOrigin, reportHostError)
      releases.push(() => { ptyStream.close() })
      releases.push(ctx.acrylWeb.registerUpgrade({
        path: WORKSPACE_PTY_STREAM_PATH,
        handler: (req, socket, head) => { ptyStream.handleUpgrade(req, socket, head) },
      }))
      const agentRoutes = [
        [WORKSPACE_AGENTS_PATH, handleWorkspaceAgentsRequest],
        [WORKSPACE_AGENTS_REMOVE_PATH, handleWorkspaceAgentsRemoveRequest],
      ] as const
      for (const [path, handler] of agentRoutes) {
        releases.push(ctx.acrylWeb.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, catalog, reportHostError),
        }))
      }
      // The chat is the DSH `agents` service; reading it per request, not injecting it, is what lets this plugin stay up when the chat is off.
      const services: { get(name: string): unknown } = ctx
      releases.push(ctx.acrylWeb.register({
        kind: 'exact',
        path: WORKSPACE_CAPABILITIES_PATH,
        handler: (req, res) => { handleWorkspaceCapabilitiesRequest(req, res, rendererOrigin, () => ({ chat: services.get('agents') !== undefined })) },
      }))
      // The project list is ACRYL's own: one section of the ACRYL home's settings, released with this plugin so a reloaded plugin registers it again.
      const projects = new ProjectRegistry(ctx.acrylSettings.register(PROJECTS_NAMESPACE, ProjectsSchema))
      releases.push(ctx.acrylWeb.register({
        kind: 'exact',
        path: WORKSPACE_PROJECTS_PATH,
        handler: (req, res) => { void handleProjectsRequest(req, res, rendererOrigin, projects, reportHostError) },
      }))
      releases.push(ctx.acrylWeb.register({
        kind: 'exact',
        path: WORKSPACE_AGENT_SETTINGS_PATH,
        handler: (req, res) => handleWorkspaceAgentSettingsRequest(req, res, rendererOrigin, agentSettings, reportHostError),
      }))
      releases.push(ctx.acrylWeb.register({
        kind: 'exact',
        path: WORKSPACE_AGENT_STATUS_PATH,
        handler: (req, res) => handleAgentStatusRequest(req, res, rendererOrigin, statusToken, agentStatus, reportHostError),
      }))
      const gitRoutes = [
        [WORKSPACE_GIT_REPO_PATH, handleWorkspaceGitRepoRequest],
        [WORKSPACE_GIT_STATUS_PATH, handleWorkspaceGitStatusRequest],
        [WORKSPACE_GIT_DIFF_PATH, handleWorkspaceGitDiffRequest],
        [WORKSPACE_GIT_CHECKS_PATH, handleWorkspaceGitChecksRequest],
        [WORKSPACE_GIT_WORKTREE_PATH, handleWorkspaceGitWorktreeRequest],
        [WORKSPACE_GIT_SEARCH_PATH, handleWorkspaceGitSearchRequest],
        [WORKSPACE_GIT_STAGE_PATH, handleWorkspaceGitStageRequest],
        [WORKSPACE_GIT_UNSTAGE_PATH, handleWorkspaceGitUnstageRequest],
        [WORKSPACE_GIT_COMMIT_PATH, handleWorkspaceGitCommitRequest],
      ] as const
      const filesRoutes = [
        [WORKSPACE_FILES_TREE_PATH, handleWorkspaceFilesTreeRequest],
        [WORKSPACE_FILES_READ_PATH, handleWorkspaceFilesReadRequest],
        [WORKSPACE_FILES_WRITE_PATH, handleWorkspaceFilesWriteRequest],
        [WORKSPACE_FILES_ENTRY_PATH, handleWorkspaceFilesEntryRequest],
      ] as const
      for (const [path, handler] of filesRoutes) {
        releases.push(ctx.acrylWeb.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, workspaceFiles, reportHostError),
        }))
      }
      for (const [path, handler] of gitRoutes) {
        releases.push(ctx.acrylWeb.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, workspaceGit, reportHostError),
        }))
      }
      // The OS's own folder chooser, for the "+" on Web (a browser page cannot open one that yields a path).
      const pickFolder = singleFlight(() => pickFolderNatively(process.platform))
      releases.push(ctx.acrylWeb.register({
        kind: 'exact',
        path: WORKSPACE_PICK_FOLDER_PATH,
        handler: (req, res) => handleWorkspacePickFolderRequest(req, res, rendererOrigin, pickFolder, reportHostError),
      }))
    } catch (cause) {
      for (const release of releases.reverse()) release()
      void workspaceGit.dispose()
      throw cause
    }
    return async () => {
      for (const release of releases.reverse()) release()
      await Promise.all([workspacePty.disposeAll(), workspaceGit.dispose()])
    }
  }, 'acryl-workspace: routes, PTY table and git service')
}
