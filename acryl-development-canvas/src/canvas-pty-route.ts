/** Same-origin JSON handlers for Development Canvas PTY sessions. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CanvasPtyRegistry } from './canvas-pty.ts'
import {
  CANVAS_PTY_CLOSE_PATH,
  CANVAS_PTY_INPUT_PATH,
  CANVAS_PTY_PATH,
  CANVAS_PTY_RESIZE_PATH,
  isCanvasPtyCommandId,
} from './canvas-pty-contract.ts'

const MAX_BODY_BYTES = 16 * 1024

class BodyTooLargeError extends Error {}

function finishJson(
  res: ServerResponse,
  statusCode: number,
  value: object,
  allow?: 'GET' | 'POST',
): void {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  if (allow !== undefined) res.setHeader('allow', allow)
  res.end(JSON.stringify(value))
}

function error(message: string): { readonly error: string } {
  return { error: message }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]'
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  if (address === '::1' || address === '127.0.0.1') return true
  if (address.startsWith('::ffff:')) return address.slice('::ffff:'.length).startsWith('127.')
  return address.startsWith('127.')
}

function isSameOriginLoopbackRequest(
  req: IncomingMessage,
  expectedOrigin: string,
  mutating: boolean,
): boolean {
  let expected: URL
  try {
    expected = new URL(expectedOrigin)
  } catch {
    return false
  }
  if (expected.origin !== expectedOrigin || expected.protocol !== 'http:'
    || expected.username !== '' || expected.password !== ''
    || !isLoopbackHostname(expected.hostname)) return false
  if (!isLoopbackAddress(req.socket.remoteAddress)) return false
  if (req.headers.host?.toLowerCase() !== expected.host.toLowerCase()) return false
  let origin: string | undefined
  try {
    origin = req.headers.origin === undefined ? undefined : new URL(req.headers.origin).origin
    if (req.headers.origin !== undefined && origin !== req.headers.origin) origin = undefined
  } catch {
    origin = undefined
  }
  if (origin === expected.origin) {
    return req.headers['sec-fetch-site'] === undefined || req.headers['sec-fetch-site'] === 'same-origin'
  }
  if (mutating) return false
  try {
    return req.headers['sec-fetch-site'] === 'same-origin'
      && req.headers.referer !== undefined
      && new URL(req.headers.referer).origin === expected.origin
  } catch {
    return false
  }
}

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
 * POST start and GET snapshot for the Canvas PTY route.
 */
export async function handleCanvasPtyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: CanvasPtyRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) {
      return finishJson(res, 403, error('forbidden'))
    }
    const id = new URL(req.url ?? '', 'http://127.0.0.1').searchParams.get('id')
    if (id === null || id.length === 0) return finishJson(res, 400, error('invalid canvas PTY request'))
    try {
      return finishJson(res, 200, registry.read(id), 'GET')
    } catch (cause) {
      reportError('read canvas PTY', cause)
      return finishJson(res, 404, error('unknown canvas PTY session'))
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
    return finishJson(res, 400, error('invalid canvas PTY request'))
  }
  if (!isObject(body) || !isCanvasPtyCommandId(body.commandId) || Object.keys(body).length !== 1) {
    return finishJson(res, 400, error('invalid canvas PTY request'))
  }
  try {
    return finishJson(res, 200, registry.start(body.commandId))
  } catch (cause) {
    reportError('start canvas PTY', cause)
    return finishJson(res, 500, error(cause instanceof Error ? cause.message : 'canvas PTY spawn failed'))
  }
}

/** POST stdin to a live session. */
export async function handleCanvasPtyInputRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: CanvasPtyRegistry,
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
    return finishJson(res, 400, error('invalid canvas PTY input'))
  }
  if (!isObject(body) || typeof body.id !== 'string' || typeof body.data !== 'string'
    || Object.keys(body).length !== 2) {
    return finishJson(res, 400, error('invalid canvas PTY input'))
  }
  try {
    registry.write(body.id, body.data)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('write canvas PTY', cause)
    return finishJson(res, 404, error('unknown canvas PTY session'))
  }
}

/** POST terminal dimensions to a live session. */
export async function handleCanvasPtyResizeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: CanvasPtyRegistry,
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
    return finishJson(res, 400, error('invalid canvas PTY resize'))
  }
  if (!isObject(body) || typeof body.id !== 'string'
    || !Number.isInteger(body.cols) || !Number.isInteger(body.rows)
    || typeof body.cols !== 'number' || typeof body.rows !== 'number'
    || body.cols < 2 || body.cols > 500 || body.rows < 1 || body.rows > 200
    || Object.keys(body).length !== 3) {
    return finishJson(res, 400, error('invalid canvas PTY resize'))
  }
  try {
    registry.resize(body.id, body.cols, body.rows)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('resize canvas PTY', cause)
    return finishJson(res, 404, error('unknown canvas PTY session'))
  }
}

/** POST idempotent close. */
export async function handleCanvasPtyCloseRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: CanvasPtyRegistry,
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
    return finishJson(res, 400, error('invalid canvas PTY close'))
  }
  if (!isObject(body) || typeof body.id !== 'string' || Object.keys(body).length !== 1) {
    return finishJson(res, 400, error('invalid canvas PTY close'))
  }
  try {
    await registry.close(body.id)
    return finishJson(res, 200, { accepted: true })
  } catch (cause) {
    reportError('close canvas PTY', cause)
    return finishJson(res, 500, error('canvas PTY could not be closed'))
  }
}

export const canvasPtyRoutePaths = {
  pty: CANVAS_PTY_PATH,
  input: CANVAS_PTY_INPUT_PATH,
  resize: CANVAS_PTY_RESIZE_PATH,
  close: CANVAS_PTY_CLOSE_PATH,
} as const
