/** Same-origin JSON handlers for ACRYL Workspace PTY sessions. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WorkspacePtyRegistry } from './workspace-pty.ts'
import { error, finishJson, isSameOriginLoopbackRequest } from './workspace-http.ts'
import {
  WORKSPACE_PTY_CLOSE_PATH,
  WORKSPACE_PTY_INPUT_PATH,
  WORKSPACE_PTY_PATH,
  WORKSPACE_PTY_RESIZE_PATH,
  isWorkspacePtyCommandId,
} from './workspace-pty-contract.ts'

const MAX_BODY_BYTES = 16 * 1024

class BodyTooLargeError extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new SyntaxError('invalid content length')
    if (Number(declaredLength) > MAX_BODY_BYTES) throw new BodyTooLargeError()
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * POST start and GET snapshot for the Workspace PTY route.
 */
export async function handleWorkspacePtyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: WorkspacePtyRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) {
      return finishJson(res, 403, error('forbidden'))
    }
    const id = new URL(req.url ?? '', 'http://127.0.0.1').searchParams.get('id')
    if (id === null || id.length === 0) return finishJson(res, 400, error('invalid workspace PTY request'))
    try {
      return finishJson(res, 200, registry.read(id), 'GET')
    } catch (cause) {
      reportError('read workspace PTY', cause)
      return finishJson(res, 404, error('unknown workspace PTY session'))
    }
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  let body: unknown
  try {
    body = await readJson(req)
  } catch (cause) {
    if (cause instanceof BodyTooLargeError) return finishJson(res, 413, error('body too large'))
    return finishJson(res, 400, error('invalid workspace PTY request'))
  }
  const extraKeys = isObject(body) ? Object.keys(body).filter(key => key !== 'commandId' && key !== 'cwd') : []
  if (!isObject(body) || !isWorkspacePtyCommandId(body.commandId) || extraKeys.length > 0
    || (body.cwd !== undefined && (typeof body.cwd !== 'string' || body.cwd.length === 0))) {
    return finishJson(res, 400, error('invalid workspace PTY request'))
  }
  try {
    return finishJson(res, 200, registry.start(body.commandId, body.cwd))
  } catch (cause) {
    reportError('start workspace PTY', cause)
    return finishJson(res, 500, error(cause instanceof Error ? cause.message : 'workspace PTY spawn failed'))
  }
}

/** POST stdin to a live session. */
export async function handleWorkspacePtyInputRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: WorkspacePtyRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return finishJson(res, 400, error('invalid workspace PTY input'))
  }
  if (!isObject(body) || typeof body.id !== 'string' || typeof body.data !== 'string'
    || Object.keys(body).length !== 2) {
    return finishJson(res, 400, error('invalid workspace PTY input'))
  }
  try {
    registry.write(body.id, body.data)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('write workspace PTY', cause)
    return finishJson(res, 404, error('unknown workspace PTY session'))
  }
}

/** POST terminal dimensions to a live session. */
export async function handleWorkspacePtyResizeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: WorkspacePtyRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return finishJson(res, 400, error('invalid workspace PTY resize'))
  }
  if (!isObject(body) || typeof body.id !== 'string'
    || !Number.isInteger(body.cols) || !Number.isInteger(body.rows)
    || typeof body.cols !== 'number' || typeof body.rows !== 'number'
    || body.cols < 2 || body.cols > 500 || body.rows < 1 || body.rows > 200
    || Object.keys(body).length !== 3) {
    return finishJson(res, 400, error('invalid workspace PTY resize'))
  }
  try {
    registry.resize(body.id, body.cols, body.rows)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('resize workspace PTY', cause)
    return finishJson(res, 404, error('unknown workspace PTY session'))
  }
}

/** POST idempotent close. */
export async function handleWorkspacePtyCloseRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: WorkspacePtyRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return finishJson(res, 400, error('invalid workspace PTY close'))
  }
  if (!isObject(body) || typeof body.id !== 'string' || Object.keys(body).length !== 1) {
    return finishJson(res, 400, error('invalid workspace PTY close'))
  }
  try {
    await registry.close(body.id)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('close workspace PTY', cause)
    return finishJson(res, 500, error('workspace PTY could not be closed'))
  }
}

export const workspacePtyRoutePaths = {
  pty: WORKSPACE_PTY_PATH,
  input: WORKSPACE_PTY_INPUT_PATH,
  resize: WORKSPACE_PTY_RESIZE_PATH,
  close: WORKSPACE_PTY_CLOSE_PATH,
} as const
