/** Strict private loopback routes for plugin lifecycle inspection and mutation. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  PluginLifecycleEntryRequest,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './plugin-lifecycle-contract.ts'
import { PluginLifecycleError } from './plugin-lifecycle-controller.ts'
import {
  INVALID_BODY,
  error,
  finishJson,
  isSameOriginLoopbackRequest,
  parsePostBody,
} from './desktop-settings-route.ts'

const MAX_ENTRY_ID_LENGTH = 512

function publicLifecycleError(cause: unknown): string {
  if (!(cause instanceof PluginLifecycleError)) return 'Plugin lifecycle operation failed.'
  switch (cause.code) {
    case 'unknown-entry': return 'The selected plugin no longer exists.'
    case 'protected-entry': return 'The selected plugin is protected.'
    case 'entry-changed': return 'The selected plugin identity changed. Refresh and try again.'
    case 'already-enabled': return 'The selected plugin is already enabled.'
    case 'already-disabled': return 'The selected plugin is already disabled.'
    case 'not-mounted': return 'The selected plugin is not mounted.'
    case 'persistence-failed': return 'The plugin change could not be saved.'
    case 'lifecycle-failed': return 'The plugin lifecycle transition failed.'
  }
}

export interface PluginLifecycleRouteController {
  snapshot(): PluginLifecycleSnapshot
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>
  reload(entryId?: string): Promise<PluginLifecycleReceipt>
}

export type PluginLifecycleRouteSuccess = () => void

function parseEntryRequest(value: unknown): PluginLifecycleEntryRequest | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1
    || typeof record.entryId !== 'string'
    || record.entryId.length === 0
    || record.entryId.length > MAX_ENTRY_ID_LENGTH) return undefined
  return { entryId: record.entryId }
}

function parseReloadRequest(value: unknown): PluginLifecycleEntryRequest | undefined | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 0) return null
  return parseEntryRequest(value)
}

/** Serve a current Host and Client-graph lifecycle snapshot. */
export async function handlePluginLifecycleSnapshotRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginLifecycleRouteController,
  reportError: (operation: string, cause: unknown) => void = () => {},
  _afterSuccess: PluginLifecycleRouteSuccess = () => {},
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
    reportError('read plugin lifecycle', cause)
    finishJson(res, 500, error('plugin lifecycle unavailable'))
  }
}

async function entryAction(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginLifecycleRouteController,
  action: 'enable' | 'disable',
  reportError: (operation: string, cause: unknown) => void,
  afterSuccess: PluginLifecycleRouteSuccess,
): Promise<void> {
  if (req.method !== 'POST') {
    return finishJson(res, 405, error('method not allowed'), 'POST')
  }
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  const value = await parsePostBody(req, res)
  if (value === INVALID_BODY) return
  const request = parseEntryRequest(value)
  if (request === undefined) {
    return finishJson(res, 400, error(`invalid plugin ${action} request`))
  }
  let receipt: PluginLifecycleReceipt
  try {
    receipt = await controller.setEnabled(request.entryId, action === 'enable')
  } catch (cause) {
    reportError(`${action} plugin`, cause)
    finishJson(res, 409, error(publicLifecycleError(cause)))
    return
  }
  finishJson(res, 200, receipt)
  afterSuccess()
}

export function handlePluginLifecycleEnableRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginLifecycleRouteController,
  reportError: (operation: string, cause: unknown) => void = () => {},
  afterSuccess: PluginLifecycleRouteSuccess = () => {},
): Promise<void> {
  return entryAction(req, res, expectedOrigin, controller, 'enable', reportError, afterSuccess)
}

export function handlePluginLifecycleDisableRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginLifecycleRouteController,
  reportError: (operation: string, cause: unknown) => void = () => {},
  afterSuccess: PluginLifecycleRouteSuccess = () => {},
): Promise<void> {
  return entryAction(req, res, expectedOrigin, controller, 'disable', reportError, afterSuccess)
}

/** Reload one managed entry or every mounted managed entry. */
export async function handlePluginLifecycleReloadRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  controller: PluginLifecycleRouteController,
  reportError: (operation: string, cause: unknown) => void = () => {},
  afterSuccess: PluginLifecycleRouteSuccess = () => {},
): Promise<void> {
  if (req.method !== 'POST') {
    return finishJson(res, 405, error('method not allowed'), 'POST')
  }
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
    return finishJson(res, 403, error('forbidden'))
  }
  const value = await parsePostBody(req, res)
  if (value === INVALID_BODY) return
  const request = parseReloadRequest(value)
  if (request === undefined) {
    return finishJson(res, 400, error('invalid plugin reload request'))
  }
  let receipt: PluginLifecycleReceipt
  try {
    receipt = await controller.reload(request?.entryId)
  } catch (cause) {
    reportError('reload plugin', cause)
    finishJson(res, 409, error(publicLifecycleError(cause)))
    return
  }
  finishJson(res, 200, receipt)
  afterSuccess()
}
