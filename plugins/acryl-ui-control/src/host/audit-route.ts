/** Same-origin handler for reading the recent audit entries (the Settings viewer). */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import type { AuditLog } from './audit.ts'

export const UI_CONTROL_AUDIT_PATH = '/api/acryl-ui-control/audit'

/** GET the most recent entries, newest last. Read-only: the log can only be appended to by the tools. */
export function createAuditRequestHandler(audit: AuditLog) {
  return function handleAuditRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string): void {
    if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    finishJson(res, 200, { entries: audit.recent(100) }, 'GET')
  }
}
