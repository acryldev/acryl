/** Same-origin browser client for the worktree file routes. */

import {
  WORKSPACE_FILES_READ_PATH,
  WORKSPACE_FILES_TREE_PATH,
  WORKSPACE_FILES_WRITE_PATH,
  parseFileContentView,
  parseFileSavedView,
  parseFilesTreeView,
  type FileContentView,
  type FileSavedView,
  type FilesTreeView,
} from '../../files/contract.ts'

/** A save that lost against a change made on disk since the file was read. */
export class FileConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileConflictError'
  }
}

export interface WorkspaceFilesApi {
  /** @param dir - directory relative to the worktree, `''` for its root. */
  tree(worktree: string, dir: string): Promise<FilesTreeView>
  read(worktree: string, file: string): Promise<FileContentView>
  /**
   * @param expectedMtimeMs - the `mtimeMs` of the read this text is based on.
   * @throws FileConflictError when the file changed on disk since that read.
   * @throws an Error whose message is fit to show the user for any other refusal.
   */
  write(worktree: string, file: string, content: string, expectedMtimeMs: number): Promise<FileSavedView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function detail(body: unknown, status: number): string {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : `the request failed (HTTP ${String(status)})`
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createWorkspaceFilesApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): WorkspaceFilesApi {
  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const response = await fetchImpl(`${path}?${new URLSearchParams(params).toString()}`, { method: 'GET', credentials: 'same-origin' })
    const body = await json(response)
    if (response.status !== 200) throw new Error(detail(body, response.status))
    return body
  }

  return {
    async tree(worktree, dir) {
      return parseFilesTreeView(await get(WORKSPACE_FILES_TREE_PATH, { path: worktree, dir }))
    },
    async read(worktree, file) {
      return parseFileContentView(await get(WORKSPACE_FILES_READ_PATH, { path: worktree, file }))
    },
    async write(worktree, file, content, expectedMtimeMs) {
      const response = await fetchImpl(WORKSPACE_FILES_WRITE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: worktree, file, content, expectedMtimeMs }),
      })
      const body = await json(response)
      if (response.status === 409) throw new FileConflictError(detail(body, 409))
      if (response.status !== 200) throw new Error(detail(body, response.status))
      return parseFileSavedView(body)
    },
  }
}
