/** Same-origin browser client for the read-only Workspace git routes. */

import {
  WORKSPACE_GIT_DIFF_PATH,
  WORKSPACE_GIT_REPO_PATH,
  WORKSPACE_GIT_STATUS_PATH,
  parseGitDiffView,
  parseGitRepoView,
  parseGitStatusView,
  type GitDiffView,
  type GitRepoView,
  type GitStatusView,
} from '../../workspace-git-contract.ts'

export interface WorkspaceGitApi {
  /** @returns the repository containing `cwd`, or null when it is not in a git repository. */
  repo(cwd: string): Promise<GitRepoView | null>
  status(path: string): Promise<GitStatusView>
  diff(path: string, file: string): Promise<GitDiffView>
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
    async diff(path, file) {
      const { status, body } = await getJson(WORKSPACE_GIT_DIFF_PATH, { path, file })
      if (status !== 200) throw failure('diff', status, body)
      return parseGitDiffView(body)
    },
  }
}
