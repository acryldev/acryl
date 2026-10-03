/** Same-origin read of what the running composition offers. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import type { WorkspaceCapabilities } from './contract.ts'

/**
 * GET the capabilities. `read` is asked on every request, so a chat that was switched on or off in the Loader since the page loaded is
 * reported as it is now: the truth is the composition, not a flag copied from a Blueprint.
 */
export function handleWorkspaceCapabilitiesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  read: () => WorkspaceCapabilities,
): void {
  if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
  return finishJson(res, 200, read(), 'GET')
}
