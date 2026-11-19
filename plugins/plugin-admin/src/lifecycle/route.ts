/** Strict private loopback routes for plugin lifecycle inspection and mutation. */

import { Acryl } from 'acrylblends'
import { PluginLifecycleError } from 'acryl-control'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, privateApi, readJson, type ReportError } from 'acryl-loopback-http/router'
import {
  PLUGIN_LIFECYCLE_DISABLE_PATH,
  PLUGIN_LIFECYCLE_ENABLE_PATH,
  PLUGIN_LIFECYCLE_PATH,
  PLUGIN_LIFECYCLE_RELOAD_PATH,
  type PluginLifecycleEntryRequest,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from './contract.ts'

const MAX_ENTRY_ID_LENGTH = 512

function publicLifecycleError(cause: unknown): string {
  if (!(cause instanceof PluginLifecycleError)) return 'Plugin lifecycle operation failed.'
  switch (cause.code) {
    case 'unknown-entry': return 'The selected plugin no longer exists.'
    case 'protected-entry': return 'The selected plugin is a core capability and cannot be toggled.'
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

/**
 * The lifecycle snapshot and its three changes as one app, under the shared private-route rules: a read only from the app's own page,
 * a change only with the exact `Origin` and a JSON body (415 otherwise) of at most 16 KiB (413), and 405 with `Allow` for another
 * method. A malformed or invalid body is 400; a change the lifecycle refuses is reported and answered 409 with a fixed public reason.
 */
export function lifecycleRoutes(controller: PluginLifecycleRouteController, report: ReportError = () => {}): Acryl {
  const app = new Acryl()
  app.get(PLUGIN_LIFECYCLE_PATH, ownPage, (c) => {
    try {
      return c.json(controller.snapshot())
    } catch (cause) {
      report('read plugin lifecycle', cause)
      return c.json(error('plugin lifecycle unavailable'), 500)
    }
  })

  const change = <T>(path: string, parse: (value: unknown) => T | undefined, run: (request: T) => Promise<PluginLifecycleReceipt>, operation: string, invalid: string): void => {
    app.post(path, ownPage, jsonContent, jsonBody(), async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return c.json(error('invalid JSON request'), 400)
      const request = parse(value)
      if (request === undefined) return c.json(error(invalid), 400)
      try {
        return c.json(await run(request))
      } catch (cause) {
        report(operation, cause)
        return c.json(error(publicLifecycleError(cause)), 409)
      }
    })
  }
  change(PLUGIN_LIFECYCLE_ENABLE_PATH, parseEntryRequest, request => controller.setEnabled(request.entryId, true), 'enable plugin', 'invalid plugin enable request')
  change(PLUGIN_LIFECYCLE_DISABLE_PATH, parseEntryRequest, request => controller.setEnabled(request.entryId, false), 'disable plugin', 'invalid plugin disable request')
  change(PLUGIN_LIFECYCLE_RELOAD_PATH, parseReloadRequest, request => controller.reload(request?.entryId), 'reload plugin', 'invalid plugin reload request')

  return privateApi(PLUGIN_LIFECYCLE_PATH, app)
}
