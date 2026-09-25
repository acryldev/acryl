/** Same-origin GET handlers for the read-only ACRYL Workspace git routes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { BodyTooLargeError, error, finishJson, isSameOriginLoopbackRequest, readJson } from '../http.ts'
import { WorkspaceGitError, type WorkspaceGit } from './service.ts'

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
    return respondError(res, cause, operation, reportError)
  }
}

function respondError(res: ServerResponse, cause: unknown, operation: string, reportError: ReportError): void {
  if (cause instanceof WorkspaceGitError) {
    if (cause.kind === 'invalid') return finishJson(res, 400, error(cause.message))
    if (cause.kind === 'conflict') return finishJson(res, 409, error(cause.message))
    if (cause.kind === 'not-repo') return finishJson(res, 404, error('not a git repository'))
  }
  reportError(operation, cause)
  return finishJson(res, 500, error('git request failed'))
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
    // 200 with `{ repo: null }` for a directory that is not a repository: that is an ordinary answer,
    // and a 404 would print a console error for every temporary folder a chat session uses.
    async params => ({ repo: await git.repo(required(params, 'cwd')) }))
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

/** GET the runnable checks (package scripts) for `?path=`. */
export function handleWorkspaceGitChecksRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'read checks', reportError,
    params => git.checks(required(params, 'path')))
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

/** POST `{ cwd, branch }`: create a branch and its worktree. The only route that changes a repository. */
export async function handleWorkspaceGitWorktreeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJson(req)
  } catch (cause) {
    if (cause instanceof BodyTooLargeError) return finishJson(res, 413, error('body too large'))
    return finishJson(res, 400, error('invalid worktree request'))
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)
    || !('cwd' in body) || typeof body.cwd !== 'string' || !('branch' in body) || typeof body.branch !== 'string'
    || Object.keys(body).length !== 2) {
    return finishJson(res, 400, error('invalid worktree request'))
  }
  try {
    return finishJson(res, 200, await git.createWorktree(body.cwd, body.branch))
  } catch (cause) {
    return respondError(res, cause, 'create git worktree', reportError)
  }
}
