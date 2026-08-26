/** Strict private loopback route for the native Host Cordis architecture snapshot. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CordisPlaneSnapshot } from './plugin-architecture-contract.ts'
import {
  error,
  finishJson,
  isSameOriginLoopbackRequest,
} from './desktop-settings-route.ts'

export interface PluginArchitectureRouteController {
  snapshot(): CordisPlaneSnapshot
}

export async function handlePluginArchitectureSnapshotRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginArchitectureRouteController,
  reportError: (operation: string, cause: unknown) => void = () => {},
): Promise<void> {
  if (req.method !== 'GET') {
    return finishJson(res, 405, error('method not allowed'), 'GET')
  }
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) {
    return finishJson(res, 403, error('forbidden'))
  }
  try {
    finishJson(res, 200, controller.snapshot())
  } catch (cause) {
    reportError('read Cordis architecture', cause)
    finishJson(res, 500, error('Cordis architecture unavailable'))
  }
}
