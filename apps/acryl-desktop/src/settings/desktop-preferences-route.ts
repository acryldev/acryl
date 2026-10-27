/** Strict loopback route for ACRYL's Desktop preferences (shell mode, notifications), stored by `acryl-settings`, on the router. */

import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, readJson, type ReportError } from 'acryl-loopback-http/router'

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
export function desktopPreferencesRoutes(store: DesktopPreferencesStore, reportError: ReportError = () => {}): Acryl {
  const read = (): Record<string, unknown> => Object.fromEntries(ALLOWED_NAMESPACES.map(namespace => [namespace, store.get(namespace) ?? null]))
  return new Acryl()
    .get(DESKTOP_PREFERENCES_PATH, ownPage, c => c.json(read()))
    .post(DESKTOP_PREFERENCES_PATH, ownPage, jsonContent, jsonBody(MAX_BODY_BYTES), async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON) return c.json(error('invalid JSON request'), 400)
      const update = parseUpdate(body)
      if (update === undefined) return c.json(error('invalid preferences request'), 400)
      try {
        await store.update(update.namespace, update.patch)
      } catch (cause) {
        reportError('update preferences', cause)
        return c.json(error('preference rejected'), 422)
      }
      return c.json(read())
    })
}
