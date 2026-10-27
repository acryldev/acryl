/**
 * The online channel's own route (spec 041 TB30): one loopback-only POST endpoint an outside CLI operator on
 * this machine calls, authorized by the per-instance secret (TB03), that runs one Scope A call against
 * whichever ACRYL window is currently focused. Not reachable from a browser tab or another machine: loopback
 * only, with a constant-time `Bearer` check (`operatorOnly`, `./http.ts`).
 */

import { Acryl } from 'acryl-router'
import { error } from 'acryl-loopback-http'
import { UiControlError, parseUiRequest, type UiResult } from 'acryl-door/protocol'
import { INVALID_JSON, jsonBody, operatorOnly, readJson, type ReportError } from './http.ts'

export const ONLINE_CALL_PATH = '/api/acryl-agent-control/online/call'

/** What the response body carries: the result on success, or the same typed code+message a model-facing tool sees on failure. */
export type OnlineCallResponse =
  | { readonly ok: true; readonly result: UiResult }
  | { readonly ok: false; readonly code: string; readonly message: string }

/**
 * POST `{ op, ... }` (a UiRequest) with `Authorization: Bearer <secret>`, from the loopback interface.
 * @param run - runs one already-parsed call; separated from the route so it is exercised the same way by a
 * real Loader test (`callAndRecord`/`runOnlineCall`, `host/tools.ts`) without a real socket in the way.
 * A caller that goes away aborts the call through the request's signal.
 */
export function onlineCallRoutes(
  secret: string,
  run: (request: ReturnType<typeof parseUiRequest>, signal: AbortSignal) => Promise<UiResult>,
  reportError: ReportError,
): Acryl {
  return new Acryl().post(ONLINE_CALL_PATH, operatorOnly(secret), jsonBody, async (c) => {
    const body = await readJson(c)
    if (body === INVALID_JSON) return c.json(error('invalid request body'), 400)
    let request: ReturnType<typeof parseUiRequest>
    try {
      request = parseUiRequest(body)
    } catch (cause) {
      const message = cause instanceof UiControlError ? cause.message : 'invalid request'
      return c.json({ ok: false, code: 'invalid', message } satisfies OnlineCallResponse, 400)
    }
    try {
      return c.json({ ok: true, result: await run(request, c.req.raw.signal) } satisfies OnlineCallResponse)
    } catch (cause) {
      if (cause instanceof UiControlError) return c.json({ ok: false, code: cause.code, message: cause.message } satisfies OnlineCallResponse)
      reportError('run an online channel call', cause)
      return c.json(error('the call could not be run'), 500)
    }
  })
}
