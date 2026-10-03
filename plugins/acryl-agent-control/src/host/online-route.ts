/**
 * The online channel's own route (spec 041 TB30): one loopback-only POST endpoint an outside CLI operator on
 * this machine calls, authorized by the per-instance secret (TB03), that runs one Scope A call against
 * whichever ACRYL window is currently focused. Not reachable from a browser tab or another machine: loopback
 * only, and its `Bearer` token check follows the same `timingSafeEqual` pattern every other private route with
 * a bearer secret in this codebase already uses (`plugins/acryl-workspace/src/agents/status/route.ts`).
 */

import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isLoopbackAddress, readJsonBody } from 'acryl-loopback-http'
import { UiControlError, parseUiRequest, type UiResult } from '../contract.ts'

export const ONLINE_CALL_PATH = '/api/acryl-agent-control/online/call'

export function tokenMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** What the response body carries: the result on success, or the same typed code+message a model-facing tool sees on failure. */
export type OnlineCallResponse =
  | { readonly ok: true; readonly result: UiResult }
  | { readonly ok: false; readonly code: string; readonly message: string }

/**
 * POST `{ op, ... }` (a {@link UiRequest}) with `Authorization: Bearer <secret>`, from the loopback interface.
 * @param run - runs one already-parsed call; separated from this handler so it is exercised the same way by a
 * real Loader test (`callAndRecord`/`runOnlineCall`, `host/tools.ts`) without a real socket in the way.
 */
export async function handleOnlineCallRequest(
  req: IncomingMessage,
  res: ServerResponse,
  secret: string,
  run: (request: ReturnType<typeof parseUiRequest>, signal: AbortSignal) => Promise<UiResult>,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isLoopbackAddress(req.socket.remoteAddress) || !tokenMatches(req.headers.authorization, secret)) {
    return finishJson(res, 403, error('forbidden'))
  }
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid request body'))
  }
  let request: ReturnType<typeof parseUiRequest>
  try {
    request = parseUiRequest(body)
  } catch (cause) {
    const message = cause instanceof UiControlError ? cause.message : 'invalid request'
    return finishJson(res, 400, { ok: false, code: 'invalid', message } satisfies OnlineCallResponse)
  }
  const controller = new AbortController()
  req.on('close', () => { controller.abort() })
  try {
    const result = await run(request, controller.signal)
    return finishJson(res, 200, { ok: true, result } satisfies OnlineCallResponse)
  } catch (cause) {
    if (cause instanceof UiControlError) {
      return finishJson(res, 200, { ok: false, code: cause.code, message: cause.message } satisfies OnlineCallResponse)
    }
    reportError('run an online channel call', cause)
    return finishJson(res, 500, error('the call could not be run'))
  }
}
