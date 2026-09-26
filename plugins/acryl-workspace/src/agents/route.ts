/** Same-origin handlers for the custom agent catalog. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest, readJson } from '../http.ts'
import type { AgentCatalog } from './catalog.ts'
import { AgentDefinitionError } from './definition.ts'

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
    body = await readJson(req)
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
    body = await readJson(req)
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
