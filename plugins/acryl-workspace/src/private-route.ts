/**
 * What every workspace route shares, on the router: the private-route rules of `acryl-loopback-http/router` (only the app's own page
 * may call it, answers are never cached or sniffed, a JSON body is small) under the workspace's one prefix. Each domain folder builds its
 * routes with these and `index.ts` mounts them under {@link WORKSPACE_API_PREFIX}.
 */

import type { Acryl } from 'acrylblends'
import { privateApi as privateRoutes } from 'acryl-loopback-http/router'

export { INVALID_JSON, jsonBody, ownPage, ownPageSocket, readJson, type ReportError } from 'acryl-loopback-http/router'

/** Every workspace route lives below this path; it is the one prefix the plugin mounts on the Web server. */
export const WORKSPACE_API_PREFIX = '/api/acryl-workspace'

/** The workspace's routes as one app, the shared rules scoped to {@link WORKSPACE_API_PREFIX}. */
export function privateApi(...routes: readonly Acryl[]): Acryl {
  return privateRoutes(WORKSPACE_API_PREFIX, ...routes)
}

export function failure(message: string): { readonly error: string } {
  return { error: message }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
