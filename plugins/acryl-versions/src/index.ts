/**
 * Cordis Host plugin: the Versions routes behind the frame's left panel.
 *
 * One effect owns the confined git runner and both registrations: the app on the router and its prefix on
 * `routerHttp`. Disposal unmounts the routes first and then aborts and reaps any git process still running,
 * so an unload never leaves a git call behind.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import { VERSIONS_API_PREFIX } from './contract.ts'
import { GitRunner } from './git/runner.ts'
import { versionsRoutes } from './route.ts'
import { Versions } from './versions.ts'

export const name = 'acryl-versions'
export const inject = ['router', 'routerHttp']

export function apply(ctx: Context): void {
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-versions: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  ctx.effect(() => {
    const git = new GitRunner()
    ctx.router.route('/', versionsRoutes(new Versions(git), report))
    ctx.routerHttp.mount(VERSIONS_API_PREFIX)
    return () => { void git.dispose() }
  }, 'acryl-versions: git runner and routes')
}

export { parseVersionsEntries, Versions } from './versions.ts'
export { GitRunner } from './git/runner.ts'
export { VersionsGitError } from './git/errors.ts'
export { versionsRoutes } from './route.ts'
export {
  DEFAULT_LOG_LIMIT,
  MAX_COMMIT_MESSAGE,
  MAX_LOG_LIMIT,
  VERSIONS_API_PREFIX,
  VERSIONS_LOG_PATH,
  VERSIONS_RESTORE_PATH,
  VERSIONS_SAVE_PATH,
  VERSIONS_SHARE_PATH,
  VERSION_HASH_PATTERN,
} from './contract.ts'
export type {
  VersionsCommitView,
  VersionsEntry,
  VersionsLogView,
  VersionsRestoreView,
  VersionsSaveView,
  VersionsShareView,
} from './contract.ts'
