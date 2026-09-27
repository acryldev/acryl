/** The status route: agents POST what they are doing (bearer token, loopback only); the page GETs the list. */

import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isLoopbackAddress, isSameOriginLoopbackRequest, readJsonBody } from 'acryl-loopback-http'
import { AgentStatusError, parseStatusReport, type AgentStatusStore } from './agent-status.ts'

function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * GET (from the app's own page): every live terminal's latest status.
 * POST (from an agent's hook): `{ terminal, state }` with `Authorization: Bearer <token>`. The token is known only
 * to terminals ACRYL started for agents, and the request must come from this machine's loopback interface.
 */
export async function handleAgentStatusRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  token: string,
  store: AgentStatusStore,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    return finishJson(res, 200, { statuses: store.list() }, 'GET')
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isLoopbackAddress(req.socket.remoteAddress) || !tokenMatches(req.headers.authorization, token)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid report'))
  }
  try {
    const report = parseStatusReport(body)
    // An unknown terminal is not an error for the hook: the agent may have outlived its terminal.
    return finishJson(res, 200, { ok: store.report(report.terminal, report.state) })
  } catch (cause) {
    if (cause instanceof AgentStatusError) return finishJson(res, 400, error(cause.message))
    reportError('record agent status', cause)
    return finishJson(res, 500, error('the report could not be recorded'))
  }
}
