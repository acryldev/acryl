/** Same-origin GET handlers for the read-only ACRYL Workspace git routes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest } from './workspace-http.ts'
import { WorkspaceGitError, type WorkspaceGit } from './workspace-git.ts'

type ReportError = (operation: string, cause: unknown) => void

async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  operation: string,
  reportError: ReportError,
  compute: (params: URLSearchParams) => Promise<object | null>,
): Promise<void> {
  if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
  const params = new URL(req.url ?? '', 'http://127.0.0.1').searchParams
  try {
    const view = await compute(params)
    if (view === null) return finishJson(res, 404, error('not a git repository'), 'GET')
    return finishJson(res, 200, view, 'GET')
  } catch (cause) {
    if (cause instanceof WorkspaceGitError) {
      if (cause.kind === 'invalid') return finishJson(res, 400, error(cause.message))
      if (cause.kind === 'not-repo') return finishJson(res, 404, error('not a git repository'))
    }
    reportError(operation, cause)
    return finishJson(res, 500, error('git request failed'))
  }
}

function required(params: URLSearchParams, name: string): string {
  const value = params.get(name)
  if (value === null || value.length === 0) throw new WorkspaceGitError(`missing ${name}`, 'invalid')
  return value
}

/** GET the repository and its worktrees for `?cwd=`. */
export function handleWorkspaceGitRepoRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'read git repo', reportError,
    params => git.repo(required(params, 'cwd')))
}

/** GET changed files for `?path=`. */
export function handleWorkspaceGitStatusRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'read git status', reportError,
    params => git.status(required(params, 'path')))
}

/** GET one file's diff for `?path=&file=`. */
export function handleWorkspaceGitDiffRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'read git diff', reportError,
    params => git.diff(required(params, 'path'), required(params, 'file')))
}
