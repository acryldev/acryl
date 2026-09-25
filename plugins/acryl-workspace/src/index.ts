/** Cordis Host plugin: ACRYL Workspace PTY table and loopback routes. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WorkspaceGit } from './git/service.ts'
import {
  WORKSPACE_GIT_CHECKS_PATH,
  WORKSPACE_GIT_DIFF_PATH,
  WORKSPACE_GIT_REPO_PATH,
  WORKSPACE_GIT_STATUS_PATH,
  WORKSPACE_GIT_WORKTREE_PATH,
} from './git/contract.ts'
import {
  handleWorkspaceGitChecksRequest,
  handleWorkspaceGitDiffRequest,
  handleWorkspaceGitRepoRequest,
  handleWorkspaceGitStatusRequest,
  handleWorkspaceGitWorktreeRequest,
} from './git/route.ts'
import { WorkspacePtyRegistry } from './pty/service.ts'
import {
  WORKSPACE_PTY_CLOSE_PATH,
  WORKSPACE_PTY_INPUT_PATH,
  WORKSPACE_PTY_PATH,
  WORKSPACE_PTY_RESIZE_PATH,
} from './pty/contract.ts'
import {
  handleWorkspacePtyCloseRequest,
  handleWorkspacePtyInputRequest,
  handleWorkspacePtyRequest,
  handleWorkspacePtyResizeRequest,
} from './pty/route.ts'

/** Stable Cordis plugin name. */
export const name = 'acryl-workspace'

/** Loopback Web server required to publish canvas routes. */
export const inject = ['webServer']

/**
 * Activate Development Canvas as a neighboring, required Host plugin.
 * Disable the Loader row to unload routes and kill leftover PTY sessions.
 * @param ctx - Host context for this generation.
 */
export function apply(ctx: Context): void {
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('acryl-workspace: requires a loopback Web server')
  }
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const reportHostError = (operation: string, cause: unknown): void => {
    ctx.logger.error(
      `acryl-workspace: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  ctx.effect(() => {
    const workspacePty = new WorkspacePtyRegistry()
    const workspaceGit = new WorkspaceGit()
    const releases: Array<() => void> = []
    try {
      const ptyRoutes = [
        [WORKSPACE_PTY_PATH, handleWorkspacePtyRequest],
        [WORKSPACE_PTY_INPUT_PATH, handleWorkspacePtyInputRequest],
        [WORKSPACE_PTY_RESIZE_PATH, handleWorkspacePtyResizeRequest],
        [WORKSPACE_PTY_CLOSE_PATH, handleWorkspacePtyCloseRequest],
      ] as const
      for (const [path, handler] of ptyRoutes) {
        releases.push(ctx.webServer.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, workspacePty, reportHostError),
        }))
      }
      const gitRoutes = [
        [WORKSPACE_GIT_REPO_PATH, handleWorkspaceGitRepoRequest],
        [WORKSPACE_GIT_STATUS_PATH, handleWorkspaceGitStatusRequest],
        [WORKSPACE_GIT_DIFF_PATH, handleWorkspaceGitDiffRequest],
        [WORKSPACE_GIT_CHECKS_PATH, handleWorkspaceGitChecksRequest],
        [WORKSPACE_GIT_WORKTREE_PATH, handleWorkspaceGitWorktreeRequest],
      ] as const
      for (const [path, handler] of gitRoutes) {
        releases.push(ctx.webServer.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, workspaceGit, reportHostError),
        }))
      }
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
