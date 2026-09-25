/** Same-origin browser client for the read-only Workspace git routes. */

import {
  WORKSPACE_GIT_CHECKS_PATH,
  WORKSPACE_GIT_DIFF_PATH,
  WORKSPACE_GIT_REPO_PATH,
  WORKSPACE_GIT_STATUS_PATH,
  WORKSPACE_GIT_WORKTREE_PATH,
  parseGitChecksView,
  parseGitDiffView,
  parseGitRepoView,
  parseGitStatusView,
  parseGitWorktreeCreatedView,
  type GitChecksView,
  type GitDiffView,
  type GitRepoView,
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
