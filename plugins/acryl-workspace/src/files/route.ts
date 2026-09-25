/** Same-origin handlers for the worktree file routes: two reads and one save. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { BodyTooLargeError, error, finishJson, isSameOriginLoopbackRequest, readJson } from '../http.ts'
import { MAX_EDITABLE_BYTES } from './contract.ts'
import { WorkspaceFilesError, type WorkspaceFiles } from './service.ts'

type ReportError = (operation: string, cause: unknown) => void

function respondError(res: ServerResponse, cause: unknown, operation: string, reportError: ReportError): void {
  if (cause instanceof WorkspaceFilesError) {
    const status = { invalid: 400, 'not-found': 404, conflict: 409, 'too-large': 413, failed: 500 }[cause.kind]
    return finishJson(res, status, error(cause.message))
  }
  reportError(operation, cause)
  return finishJson(res, 500, error('file request failed'))
}

function required(params: URLSearchParams, name: string): string {
  const value = params.get(name)
  if (value === null || value.length === 0) throw new WorkspaceFilesError(`missing ${name}`, 'invalid')
  return value
}

async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  operation: string,
  reportError: ReportError,
  compute: (params: URLSearchParams) => Promise<object>,
): Promise<void> {
  if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
  const params = new URL(req.url ?? '', 'http://127.0.0.1').searchParams
  try {
    return finishJson(res, 200, await compute(params), 'GET')
  } catch (cause) {
    return respondError(res, cause, operation, reportError)
  }
}

/** GET one directory: `?path=<worktree>&dir=<relative, empty for the root>`. */
export function handleWorkspaceFilesTreeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  files: WorkspaceFiles,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'list files', reportError,
    params => files.tree(required(params, 'path'), params.get('dir') ?? ''))
}

/** GET one file's text: `?path=<worktree>&file=<relative>`. */
export function handleWorkspaceFilesReadRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  files: WorkspaceFiles,
  reportError: ReportError,
): Promise<void> {
  return handleGet(req, res, expectedOrigin, 'read file', reportError,
    params => files.read(required(params, 'path'), required(params, 'file')))
}

/** POST `{ path, file, content, expectedMtimeMs }`: replace an existing file's text. */
export async function handleWorkspaceFilesWriteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  files: WorkspaceFiles,
  reportError: ReportError,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJson(req, MAX_EDITABLE_BYTES + 64 * 1024)
  } catch (cause) {
    if (cause instanceof BodyTooLargeError) return finishJson(res, 413, error('body too large'))
    return finishJson(res, 400, error('invalid save request'))
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)
    || !('path' in body) || typeof body.path !== 'string'
    || !('file' in body) || typeof body.file !== 'string'
    || !('content' in body) || typeof body.content !== 'string'
    || !('expectedMtimeMs' in body) || typeof body.expectedMtimeMs !== 'number'
    || Object.keys(body).length !== 4) {
    return finishJson(res, 400, error('invalid save request'))
  }
  try {
    return finishJson(res, 200, await files.write(body.path, body.file, body.content, body.expectedMtimeMs))
  } catch (cause) {
    return respondError(res, cause, 'save file', reportError)
  }
}
