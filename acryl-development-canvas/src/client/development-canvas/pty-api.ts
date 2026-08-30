/** Same-origin client for Host canvas PTY sessions. */

import {
  CANVAS_PTY_CLOSE_PATH,
  CANVAS_PTY_INPUT_PATH,
  CANVAS_PTY_PATH,
  CANVAS_PTY_RESIZE_PATH,
  type CanvasPtyCommandId,
  type CanvasPtyView,
} from '../../canvas-pty-contract.ts'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseView(value: unknown): CanvasPtyView {
  if (!isObject(value)
    || typeof value.id !== 'string'
    || (value.status !== 'starting' && value.status !== 'running'
      && value.status !== 'exited' && value.status !== 'error')
    || typeof value.output !== 'string'
    || (value.exitCode !== null && typeof value.exitCode !== 'number')
    || (value.error !== null && typeof value.error !== 'string')) {
    throw new Error('acryl-development-canvas: invalid canvas PTY response')
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

export interface CanvasPtyApi {
  start(commandId: CanvasPtyCommandId): Promise<CanvasPtyView>
  read(id: string): Promise<CanvasPtyView>
  write(id: string, data: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  close(id: string): Promise<void>
}

/** @param fetcher - injected for tests; defaults to window.fetch. */
export function createCanvasPtyApi(fetcher: FetchLike = fetch): CanvasPtyApi {
  return {
    async start(commandId) {
      const response = await fetcher(CANVAS_PTY_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandId }),
      })
      const body = await readJson(response)
      if (!response.ok) {
        const message = isObject(body) && typeof body.error === 'string' ? body.error : 'canvas PTY spawn failed'
        throw new Error(message)
      }
      return parseView(body)
    },
    async read(id) {
      const url = `${CANVAS_PTY_PATH}?id=${encodeURIComponent(id)}`
      const response = await fetcher(url, { method: 'GET', credentials: 'same-origin' })
      const body = await readJson(response)
      if (!response.ok) throw new Error('acryl-development-canvas: canvas PTY read failed')
      return parseView(body)
    },
    async write(id, data) {
      const response = await fetcher(CANVAS_PTY_INPUT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, data }),
      })
      if (!response.ok) throw new Error('acryl-development-canvas: canvas PTY write failed')
    },
    async resize(id, cols, rows) {
      const response = await fetcher(CANVAS_PTY_RESIZE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, cols, rows }),
      })
      if (!response.ok) throw new Error('acryl-development-canvas: canvas PTY resize failed')
    },
    async close(id) {
      const response = await fetcher(CANVAS_PTY_CLOSE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('acryl-development-canvas: canvas PTY close failed')
    },
  }
}
