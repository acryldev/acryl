/** The workers endpoint: the page (same origin) or an outside operator on this machine holding the instance secret. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isLoopbackAddress, isSameOriginLoopbackRequest, readJsonBody } from 'acryl-loopback-http'
import { tokenMatches } from '../online-route.ts'
import { WorkerRequestError, parseWorkerRequest, type WorkerResponse } from '../../workers-contract.ts'
import type { Workers } from './service.ts'

/**
 * POST a {@link WorkerRequest}. Authorized like the rest of Agent Control: the page's own same-origin request, or (only when the online
 * channel is on, so `secret` exists) a loopback caller presenting `Authorization: Bearer <secret>`. A client that goes away mid-`send`
 * aborts it, which interrupts the worker.
 */
export async function handleWorkersRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  secret: string | undefined,
  workers: Workers,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  const page = isSameOriginLoopbackRequest(req, expectedOrigin, true)
  const operator = secret !== undefined && isLoopbackAddress(req.socket.remoteAddress) && tokenMatches(req.headers.authorization, secret)
  if (!page && !operator) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid request body'))
  }
  let request: ReturnType<typeof parseWorkerRequest>
  try {
    request = parseWorkerRequest(body)
  } catch (cause) {
    return finishJson(res, 400, { ok: false, code: 'invalid', message: cause instanceof WorkerRequestError ? cause.message : 'invalid request' } satisfies WorkerResponse)
  }
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    return finishJson(res, 200, await workers.run(request, controller.signal))
  } catch (cause) {
    reportError('run a worker request', cause)
    return finishJson(res, 500, error('the request could not be run'))
  }
}
