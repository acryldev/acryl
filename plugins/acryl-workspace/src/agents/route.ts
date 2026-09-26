/** Same-origin handlers for the custom agent catalog. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest, readJsonBody } from 'acryl-loopback-http'
import type { AgentCatalog } from './catalog.ts'
import { AgentDefinitionError } from './definition.ts'
import { parsePreferencesPatch } from './preferences.ts'
import type { AgentSettings } from './settings.ts'

type ReportError = (operation: string, cause: unknown) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** GET the catalog; POST `{ agent }` to add one (a refusal is a 400 whose message says what to fix). */
export async function handleWorkspaceAgentsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  catalog: AgentCatalog,
  reportError: ReportError,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    return finishJson(res, 200, { agents: catalog.list() }, 'GET')
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid agent request'))
  }
  if (!isRecord(body) || Object.keys(body).length !== 1 || !('agent' in body)) return finishJson(res, 400, error('invalid agent request'))
  try {
    await catalog.add(body.agent)
    return finishJson(res, 200, { agents: catalog.list() })
  } catch (cause) {
    if (cause instanceof AgentDefinitionError) return finishJson(res, 400, error(cause.message))
    reportError('add agent', cause)
    return finishJson(res, 500, error('the agent could not be saved'))
  }
}

/** POST `{ id }`: idempotent removal. */
export async function handleWorkspaceAgentsRemoveRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  catalog: AgentCatalog,
  reportError: ReportError,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid agent request'))
  }
  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.id !== 'string') return finishJson(res, 400, error('invalid agent request'))
  try {
    await catalog.remove(body.id)
    return finishJson(res, 200, { agents: catalog.list() })
  } catch (cause) {
    reportError('remove agent', cause)
    return finishJson(res, 500, error('the agent could not be removed'))
  }
}

/** GET the settings view (with a fresh check of which programs are installed); POST one change, answered with the whole view. */
export async function handleWorkspaceAgentSettingsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  settings: AgentSettings,
  reportError: ReportError,
): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    return finishJson(res, 200, settings.view(), 'GET')
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, error('invalid agent settings request'))
  }
  try {
    return finishJson(res, 200, await settings.apply(parsePreferencesPatch(body)))
  } catch (cause) {
    if (cause instanceof AgentDefinitionError) return finishJson(res, 400, error(cause.message))
    reportError('save agent settings', cause)
    return finishJson(res, 500, error('the settings could not be saved'))
  }
}
