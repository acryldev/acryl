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

/** GET a search: `?path=&q=&mode=name|content`. */
export function handleWorkspaceGitSearchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  git: WorkspaceGit,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'search', reportError, (params) => {
    const mode = params.get('mode')
    return git.search(required(params, 'path'), required(params, 'q'), mode === 'content' ? 'content' : mode === 'name' ? 'name' : 'name')
  })
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

type Parse<T> = (body: Record<string, unknown>) => T | undefined

/** POST a small JSON body, parse it strictly, run one git write, and answer with its result. */
async function handlePost<T>(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  operation: string,
  reportError: ReportError,
  parse: Parse<T>,
  compute: (input: T) => Promise<object>,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJson(req)
  } catch (cause) {
    if (cause instanceof BodyTooLargeError) return finishJson(res, 413, error('body too large'))
    return finishJson(res, 400, error(`invalid ${operation} request`))
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return finishJson(res, 400, error(`invalid ${operation} request`))
  const input = parse(body as Record<string, unknown>)
  if (input === undefined) return finishJson(res, 400, error(`invalid ${operation} request`))
  try {
    return finishJson(res, 200, await compute(input))
  } catch (cause) {
    return respondError(res, cause, operation, reportError)
  }
}

function parseFiles(body: Record<string, unknown>): { path: string; files: string[] } | undefined {
  if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || !Array.isArray(body.files)) return undefined
  if (!body.files.every((file): file is string => typeof file === 'string')) return undefined
  return { path: body.path, files: body.files }
}

/** POST `{ path, files }`: stage files, answering the worktree's status. */
export function handleWorkspaceGitStageRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, git: WorkspaceGit, reportError: ReportError): Promise<void> {
  return handlePost(req, res, expectedOrigin, 'stage', reportError, parseFiles, input => git.stage(input.path, input.files))
}

/** POST `{ path, files }`: unstage files, answering the worktree's status. */
export function handleWorkspaceGitUnstageRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, git: WorkspaceGit, reportError: ReportError): Promise<void> {
  return handlePost(req, res, expectedOrigin, 'unstage', reportError, parseFiles, input => git.unstage(input.path, input.files))
}

/** POST `{ path, message }`: commit what is staged. Never pushes. */
export function handleWorkspaceGitCommitRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, git: WorkspaceGit, reportError: ReportError): Promise<void> {
  return handlePost(
    req, res, expectedOrigin, 'commit', reportError,
    (body) => {
      if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || typeof body.message !== 'string') return undefined
      return { path: body.path, message: body.message }
    },
    input => git.commit(input.path, input.message),
  )
}

