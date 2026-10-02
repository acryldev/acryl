/** Strict loopback HTTP handler for ACRYL's Desktop preferences (shell mode, notifications), stored by `acryl-settings`. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, INVALID_BODY, isSameOriginLoopbackRequest, parseJsonPostBody } from 'acryl-loopback-http'

export const DESKTOP_PREFERENCES_PATH = '/api/desktop/preferences'

const MAX_BODY_BYTES = 4 * 1024

/** The namespaces this page may read and write; any other registered namespace is not the renderer's to change. */
const ALLOWED_NAMESPACES: readonly string[] = ['dsh-desktop', 'dsh-desktop-notifications']

/** The part of the `acrylSettings` service the route uses. */
export interface DesktopPreferencesStore {
  get(namespace: string): unknown
  update(namespace: string, patch: Readonly<Record<string, unknown>>): Promise<void>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse `{ namespace, patch }`: an allowed namespace and a small, flat patch of scalars (the schema does the real validation). */
function parseUpdate(value: unknown): { namespace: string, patch: Record<string, unknown> } | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 2) return undefined
  const { namespace, patch } = value
  if (typeof namespace !== 'string' || !ALLOWED_NAMESPACES.includes(namespace) || !isPlainRecord(patch)) return undefined
  const entries = Object.entries(patch)
  if (entries.length === 0 || entries.length > 8) return undefined
  if (!entries.every(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry))) return undefined
  return { namespace, patch }
}

/** GET: the current resolved preferences. POST `{ namespace, patch }`: merge a validated patch and answer the new values. */
export async function handleDesktopPreferencesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  store: DesktopPreferencesStore,
  reportError: (operation: string, cause: unknown) => void = () => {},
): Promise<void> {
  const read = (): Record<string, unknown> => Object.fromEntries(ALLOWED_NAMESPACES.map(namespace => [namespace, store.get(namespace) ?? null]))
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    return finishJson(res, 200, read())
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  const body = await parseJsonPostBody(req, res, MAX_BODY_BYTES)
  if (body === INVALID_BODY) return
  const update = parseUpdate(body)
  if (update === undefined) return finishJson(res, 400, error('invalid preferences request'))
  try {
    await store.update(update.namespace, update.patch)
  } catch (cause) {
    reportError('update preferences', cause)
    return finishJson(res, 422, error('preference rejected'))
  }
  finishJson(res, 200, read())
}
