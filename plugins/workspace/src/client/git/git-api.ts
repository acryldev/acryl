/** Same-origin browser client for the read-only Workspace git routes. */

import {
  WORKSPACE_GIT_CHECKS_PATH,
  WORKSPACE_GIT_COMMIT_PATH,
  WORKSPACE_GIT_STAGE_PATH,
  WORKSPACE_GIT_UNSTAGE_PATH,
  WORKSPACE_GIT_DIFF_PATH,
  WORKSPACE_GIT_REPO_PATH,
  WORKSPACE_GIT_SEARCH_PATH,
  WORKSPACE_GIT_STATUS_PATH,
  WORKSPACE_GIT_WORKTREE_PATH,
  parseGitChecksView,
  parseGitCommitView,
  parseGitDiffView,
  parseGitRepoView,
  parseGitSearchView,
  parseGitStatusView,
  parseGitWorktreeCreatedView,
  type GitChecksView,
  type GitCommitView,
  type GitDiffView,
  type GitRepoView,
  type GitSearchMode,
  type GitSearchView,
  type GitStatusView,
  type GitWorktreeCreatedView,
} from '../../git/contract.ts'

export interface WorkspaceGitApi {
  /** @returns the repository containing `cwd`, or null when it is not in a git repository. */
  repo(cwd: string): Promise<GitRepoView | null>
  status(path: string): Promise<GitStatusView>
  diff(path: string, file: string): Promise<GitDiffView>
  /** The package scripts a worktree can run as checks, with its package manager. */
  checks(path: string): Promise<GitChecksView>
  /**
   * Stage files, answering the worktree's status afterwards.
   * @throws an Error whose message is fit to show the user.
   */
  stage(path: string, files: readonly string[]): Promise<GitStatusView>
  unstage(path: string, files: readonly string[]): Promise<GitStatusView>
  /**
   * Commit what is staged (never pushes).
   * @throws an Error whose message says what to fix (no message, nothing staged, no git identity).
   */
  commit(path: string, message: string): Promise<GitCommitView>
  /**
   * Find files by name or lines by content in a worktree (literal text, capped).
   * @throws an Error whose message is fit to show the user.
   */
  search(path: string, query: string, mode: GitSearchMode): Promise<GitSearchView>
  /**
   * Create a branch and its worktree.
   * @throws an Error whose message is fit to show the user (for example "the branch x already exists").
   */
  createWorktree(cwd: string, branch: string): Promise<GitWorktreeCreatedView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createWorkspaceGitApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): WorkspaceGitApi {
  async function getJson(path: string, params: Record<string, string>): Promise<{ status: number; body: unknown }> {
    const query = new URLSearchParams(params).toString()
    const response = await fetchImpl(`${path}?${query}`, { method: 'GET', credentials: 'same-origin' })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return { status: response.status, body }
  }

  async function postJson(path: string, payload: object): Promise<unknown> {
    const response = await fetchImpl(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (response.status !== 200) {
      const detail = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `the request failed (HTTP ${String(response.status)})`
      throw new Error(detail)
    }
    return body
  }

  function failure(operation: string, status: number, body: unknown): Error {
    const detail = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `HTTP ${String(status)}`
    return new Error(`git ${operation}: ${detail}`)
  }

  return {
    async repo(cwd) {
      const { status, body } = await getJson(WORKSPACE_GIT_REPO_PATH, { cwd })
      if (status !== 200) throw failure('repo', status, body)
      if (typeof body !== 'object' || body === null || !('repo' in body)) throw new Error('git repo: invalid response')
      return body.repo === null ? null : parseGitRepoView(body.repo)
    },
    async status(path) {
      const { status, body } = await getJson(WORKSPACE_GIT_STATUS_PATH, { path })
      if (status !== 200) throw failure('status', status, body)
      return parseGitStatusView(body)
    },
    async createWorktree(cwd, branch) {
      const response = await fetchImpl(WORKSPACE_GIT_WORKTREE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd, branch }),
      })
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (response.status !== 200) {
        const detail = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `the request failed (HTTP ${String(response.status)})`
        throw new Error(detail)
      }
      return parseGitWorktreeCreatedView(body)
    },
    async search(path, query, mode) {
      const { status, body } = await getJson(WORKSPACE_GIT_SEARCH_PATH, { path, q: query, mode })
      if (status !== 200) {
        throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : `search failed (HTTP ${String(status)})`)
      }
      return parseGitSearchView(body)
    },
    async stage(path, files) {
      return parseGitStatusView(await postJson(WORKSPACE_GIT_STAGE_PATH, { path, files }))
    },
    async unstage(path, files) {
      return parseGitStatusView(await postJson(WORKSPACE_GIT_UNSTAGE_PATH, { path, files }))
    },
    async commit(path, message) {
      return parseGitCommitView(await postJson(WORKSPACE_GIT_COMMIT_PATH, { path, message }))
    },
    async checks(path) {
      const { status, body } = await getJson(WORKSPACE_GIT_CHECKS_PATH, { path })
      if (status !== 200) throw failure('checks', status, body)
      return parseGitChecksView(body)
    },
    async diff(path, file) {
      const { status, body } = await getJson(WORKSPACE_GIT_DIFF_PATH, { path, file })
      if (status !== 200) throw failure('diff', status, body)
      return parseGitDiffView(body)
    },
  }
}
