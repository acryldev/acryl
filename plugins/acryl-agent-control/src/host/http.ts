/**
 * What every Agent Control route shares, on the router. Two kinds of caller reach it, each with the guard it always had: the app's own
 * page (same origin, on the loopback address: `ownPage` from `acryl-loopback-http/router`), and an outside operator on this machine
 * (`acryl control`, a worker's MCP client) holding this run's secret. Each domain route file builds its routes with these and `index.ts`
 * mounts them under {@link AGENT_CONTROL_API_PREFIX}.
 */

import { timingSafeEqual } from 'node:crypto'
import type { Acryl, Context, MiddlewareHandler } from 'acrylblends'
import { connectionOf } from 'acrylblends/cordis/router'
import { error, isLoopbackAddress } from 'acryl-loopback-http'
import { privateApi as privateRoutes } from 'acryl-loopback-http/router'

export { INVALID_JSON, jsonBody, ownPage, readJson, type ReportError } from 'acryl-loopback-http/router'

/** Every Agent Control route lives below this path; it is the one prefix the plugin mounts on the Web server. */
export const AGENT_CONTROL_API_PREFIX = '/api/acryl-agent-control'

/** A constant-time comparison of a `Bearer` header with the secret. */
export function tokenMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** True when the request comes from a loopback peer presenting this run's secret: an outside operator on this machine. */
export function fromOperator(c: Context, secret: string | undefined): boolean {
  return secret !== undefined && isLoopbackAddress(connectionOf(c).remoteAddress) && tokenMatches(c.req.header('authorization'), secret)
}

/**
 * Only an outside operator: anything else is 403 `forbidden`, the answer `acryl control` reads as "refused, the secret rotated?".
 * Deliberately not the bearer middleware's 401, and no `Host` check: the door keeps exactly the rule it had.
 */
export function operatorOnly(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (!fromOperator(c, secret)) return c.json(error('forbidden'), 403)
    await next()
  }
}

/** The plugin's routes as one app, the shared private-route rules scoped to {@link AGENT_CONTROL_API_PREFIX}. */
export function privateApi(...routes: readonly Acryl[]): Acryl {
  return privateRoutes(AGENT_CONTROL_API_PREFIX, ...routes)
}
