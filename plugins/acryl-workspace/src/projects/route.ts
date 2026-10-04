/** Same-origin handlers for the project registry. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest, readJsonBody } from 'acryl-loopback-http'
import { ProjectRequestError, parseProjectRequest, type ProjectResponse } from './contract.ts'
import { ProjectFolderError, type ProjectRegistry } from './registry.ts'

/** GET the list; POST `{ op, ... }` to add, remove or adopt. A refusal is a 400 whose message says what to fix. */
export async function handleProjectsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  registry: ProjectRegistry,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    return finishJson(res, 200, { ok: true, view: registry.view() } satisfies ProjectResponse, 'GET')
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, { ok: false, code: 'invalid', message: 'invalid request body' } satisfies ProjectResponse)
  }
  try {
    const request = parseProjectRequest(body)
    const view = request.op === 'add' ? await registry.add(request.path)
      : request.op === 'remove' ? await registry.remove(request.path)
        : await registry.adopt(request.paths)
    return finishJson(res, 200, { ok: true, view } satisfies ProjectResponse)
  } catch (cause) {
    if (cause instanceof ProjectRequestError) return finishJson(res, 400, { ok: false, code: 'invalid', message: cause.message } satisfies ProjectResponse)
    if (cause instanceof ProjectFolderError) return finishJson(res, 400, { ok: false, code: 'not-a-folder', message: cause.message } satisfies ProjectResponse)
    reportError('change the project list', cause)
    return finishJson(res, 500, error('the project list could not be saved'))
  }
}
