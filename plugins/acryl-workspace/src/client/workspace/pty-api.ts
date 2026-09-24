/** Same-origin client for Host workspace PTY sessions. */

import {
  WORKSPACE_PTY_CLOSE_PATH,
  WORKSPACE_PTY_INPUT_PATH,
  WORKSPACE_PTY_PATH,
  WORKSPACE_PTY_RESIZE_PATH,
  type WorkspacePtyCommandId,
  type WorkspacePtyView,
} from '../../workspace-pty-contract.ts'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseView(value: unknown): WorkspacePtyView {
  if (!isObject(value)
    || typeof value.id !== 'string'
    || (value.status !== 'starting' && value.status !== 'running'
      && value.status !== 'exited' && value.status !== 'error')
    || typeof value.output !== 'string'
    || (value.exitCode !== null && typeof value.exitCode !== 'number')
    || (value.error !== null && typeof value.error !== 'string')) {
    throw new Error('acryl-workspace: invalid workspace PTY response')
  }
  return {
    id: value.id,
    status: value.status,
    output: value.output,
    exitCode: value.exitCode,
    error: value.error,
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return {}
  return JSON.parse(text) as unknown
}

export interface WorkspacePtyApi {
  /** @param cwd - optional worktree directory to start in. */
  start(commandId: WorkspacePtyCommandId, cwd?: string): Promise<WorkspacePtyView>
  read(id: string): Promise<WorkspacePtyView>
  write(id: string, data: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  close(id: string): Promise<void>
}

/** @param fetcher - injected for tests; defaults to window.fetch. */
export function createWorkspacePtyApi(fetcher: FetchLike = fetch): WorkspacePtyApi {
  return {
    async start(commandId, cwd) {
      const response = await fetcher(WORKSPACE_PTY_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cwd === undefined ? { commandId } : { commandId, cwd }),
      })
      const body = await readJson(response)
      if (!response.ok) {
        const message = isObject(body) && typeof body.error === 'string' ? body.error : 'workspace PTY spawn failed'
        throw new Error(message)
      }
      return parseView(body)
    },
    async read(id) {
      const url = `${WORKSPACE_PTY_PATH}?id=${encodeURIComponent(id)}`
      const response = await fetcher(url, { method: 'GET', credentials: 'same-origin' })
      const body = await readJson(response)
      if (!response.ok) throw new Error('acryl-workspace: workspace PTY read failed')
      return parseView(body)
    },
    async write(id, data) {
      const response = await fetcher(WORKSPACE_PTY_INPUT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, data }),
      })
      if (!response.ok) throw new Error('acryl-workspace: workspace PTY write failed')
    },
    async resize(id, cols, rows) {
      const response = await fetcher(WORKSPACE_PTY_RESIZE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, cols, rows }),
      })
      if (!response.ok) throw new Error('acryl-workspace: workspace PTY resize failed')
    },
    async close(id) {
      const response = await fetcher(WORKSPACE_PTY_CLOSE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('acryl-workspace: workspace PTY close failed')
    },
  }
}
