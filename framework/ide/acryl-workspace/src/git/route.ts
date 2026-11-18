/** The workspace git routes: five reads, and the writes the Changes panel makes (worktree, stage, unstage, commit), for the app's own page only. */

import { Acryl, type Context } from 'acrylblends'
import { INVALID_JSON, failure, isRecord, jsonBody, ownPage, readJson, type ReportError } from '../private-route.ts'
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
} from './contract.ts'
import { WorkspaceGitError, type WorkspaceGit } from './service.ts'

function required(c: Context, name: string): string {
  const value = c.req.query(name)
  if (value === undefined || value.length === 0) throw new WorkspaceGitError(`missing ${name}`, 'invalid')
  return value
}

type Parse<T> = (body: Record<string, unknown>) => T | undefined

function parseFiles(body: Record<string, unknown>): { path: string, files: string[] } | undefined {
  if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || !Array.isArray(body.files)) return undefined
  if (!body.files.every((file): file is string => typeof file === 'string')) return undefined
  return { path: body.path, files: body.files }
}

function parseWorktree(body: Record<string, unknown>): { cwd: string, branch: string } | undefined {
  if (Object.keys(body).length !== 2 || typeof body.cwd !== 'string' || typeof body.branch !== 'string') return undefined
  return { cwd: body.cwd, branch: body.branch }
}

function parseCommit(body: Record<string, unknown>): { path: string, message: string } | undefined {
  if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || typeof body.message !== 'string') return undefined
  return { path: body.path, message: body.message }
}

/**
 * GET `repo?cwd=`, `status?path=`, `checks?path=`, `search?path=&q=&mode=name|content` and `diff?path=&file=`; POST `worktree` `{ cwd, branch }`
 * (create a branch and its worktree), `stage` and `unstage` `{ path, files }`, and `commit` `{ path, message }` (never pushes).
 */
export function gitRoutes(git: WorkspaceGit, reportError: ReportError): Acryl {
  const answer = async (c: Context, operation: string, compute: () => Promise<object | null>): Promise<Response> => {
    try {
      const view = await compute()
      if (view === null) return c.json(failure('not a git repository'), 404)
      return c.json(view)
    } catch (cause) {
      if (cause instanceof WorkspaceGitError) {
        if (cause.kind === 'invalid') return c.json(failure(cause.message), 400)
        if (cause.kind === 'conflict') return c.json(failure(cause.message), 409)
        if (cause.kind === 'not-repo') return c.json(failure('not a git repository'), 404)
      }
      reportError(operation, cause)
      return c.json(failure('git request failed'), 500)
    }
  }
  /** A small JSON body, parsed strictly, then one git write answered with its result. */
  const write = <T>(operation: string, invalid: string, parse: Parse<T>, compute: (input: T) => Promise<object>) => async (c: Context): Promise<Response> => {
    const body = await readJson(c)
    const input = body === INVALID_JSON || !isRecord(body) ? undefined : parse(body)
    if (input === undefined) return c.json(failure(invalid), 400)
    return answer(c, operation, () => compute(input))
  }
  return new Acryl()
    // 200 with `{ repo: null }` for a directory that is not a repository: that is an ordinary answer, and a 404 would print a console error for
    // every temporary folder a chat session uses.
    .get(WORKSPACE_GIT_REPO_PATH, ownPage, c => answer(c, 'read git repo', async () => ({ repo: await git.repo(required(c, 'cwd')) })))
    .get(WORKSPACE_GIT_STATUS_PATH, ownPage, c => answer(c, 'read git status', () => git.status(required(c, 'path'))))
    .get(WORKSPACE_GIT_CHECKS_PATH, ownPage, c => answer(c, 'read checks', () => git.checks(required(c, 'path'))))
    .get(WORKSPACE_GIT_SEARCH_PATH, ownPage, c => answer(c, 'search', () =>
      git.search(required(c, 'path'), required(c, 'q'), c.req.query('mode') === 'content' ? 'content' : 'name')))
    .get(WORKSPACE_GIT_DIFF_PATH, ownPage, c => answer(c, 'read git diff', () => git.diff(required(c, 'path'), required(c, 'file'))))
    .post(WORKSPACE_GIT_WORKTREE_PATH, ownPage, jsonBody(), write('create git worktree', 'invalid worktree request', parseWorktree,
      input => git.createWorktree(input.cwd, input.branch)))
    .post(WORKSPACE_GIT_STAGE_PATH, ownPage, jsonBody(), write('stage', 'invalid stage request', parseFiles, input => git.stage(input.path, input.files)))
    .post(WORKSPACE_GIT_UNSTAGE_PATH, ownPage, jsonBody(), write('unstage', 'invalid unstage request', parseFiles,
      input => git.unstage(input.path, input.files)))
    .post(WORKSPACE_GIT_COMMIT_PATH, ownPage, jsonBody(), write('commit', 'invalid commit request', parseCommit, input => git.commit(input.path, input.message)))
}
