/** The workers endpoint: the page (same origin) or an outside operator on this machine holding the instance secret. */

import { Acryl, type MiddlewareHandler } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { WORKERS_PATH, WorkerRequestError, parseWorkerRequest, type WorkerResponse } from '../../workers-contract.ts'
import { INVALID_JSON, fromOperator, jsonBody, ownPage, readJson, type ReportError } from '../http.ts'
import type { Workers } from './service.ts'

/**
 * POST a WorkerRequest. Authorized like the rest of Agent Control: the page's own same-origin request, or (only when the online
 * channel is on, so `secret` exists) a loopback caller presenting `Authorization: Bearer <secret>`. A client that goes away mid-`send`
 * aborts it through the request's signal, which interrupts the worker.
 */
export function workersRoutes(secret: () => string | undefined, workers: Workers, reportError: ReportError): Acryl {
  // The operator is checked first; anyone else must pass the own-page guard, whose refusal is the answer.
  const pageOrOperator: MiddlewareHandler = async (c, next) => {
    if (fromOperator(c, secret())) { await next(); return }
    return ownPage(c, next)
  }
  return new Acryl().post(WORKERS_PATH, pageOrOperator, jsonBody, async (c) => {
    const body = await readJson(c)
    if (body === INVALID_JSON) return c.json(error('invalid request body'), 400)
    let request: ReturnType<typeof parseWorkerRequest>
    try {
      request = parseWorkerRequest(body)
    } catch (cause) {
      return c.json({ ok: false, code: 'invalid', message: cause instanceof WorkerRequestError ? cause.message : 'invalid request' } satisfies WorkerResponse, 400)
    }
    try {
      return c.json(await workers.run(request, c.req.raw.signal))
    } catch (cause) {
      reportError('run a worker request', cause)
      return c.json(error('the request could not be run'), 500)
    }
  })
}
