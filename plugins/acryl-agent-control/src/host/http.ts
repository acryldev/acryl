/**
 * What every Agent Control route shares, on the router. Two kinds of caller reach it, each with the guard it always had: the app's own
 * page (same origin, on the loopback address), and an outside operator on this machine (`acryl control`, a worker's MCP client) holding
 * this run's secret. Each domain route file builds its routes with these and `index.ts` mounts them under {@link AGENT_CONTROL_API_PREFIX}.
 */

import { timingSafeEqual } from 'node:crypto'
import { Acryl, connectionOf, type Context, type MiddlewareHandler } from 'acryl-router'
import { bodyLimit, loopbackOnly, methodNotAllowed } from 'acryl-router/middleware'
import { error, isLoopbackAddress } from 'acryl-loopback-http'

/** Every Agent Control route lives below this path; it is the one prefix the plugin mounts on the Web server. */
export const AGENT_CONTROL_API_PREFIX = '/api/acryl-agent-control'

/** The cap on a JSON request body. */
export const MAX_BODY_BYTES = 16 * 1024

export type ReportError = (operation: string, cause: unknown) => void

/** The app's own page, on the loopback address the Host serves it from, and nothing else. */
export const ownPage: MiddlewareHandler = loopbackOnly({ callers: 'own-page', hostnames: ['127.0.0.1'] })

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

/** The headers every private answer carries, set after the handler so a refusal carries them too. */
const privateHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('cache-control', 'no-store')
  c.header('x-content-type-options', 'nosniff')
}

/**
 * The plugin's routes as one app: each domain's routes, every answer with the private headers, and a known path asked with another method
 * answered 405 with its `Allow` before any guard runs. The middleware is scoped to the prefix, so it never wraps another plugin's routes.
 */
export function privateApi(...routes: readonly Acryl[]): Acryl {
  const app = new Acryl()
  app.use(`${AGENT_CONTROL_API_PREFIX}/*`, privateHeaders, methodNotAllowed({
    app,
    onMethodNotAllowed: (c, allowed) => c.json(error('method not allowed'), 405, { allow: allowed.join(', ') }),
  }))
  for (const domain of routes) app.route('/', domain)
  return app
}

/** Refuse a body over {@link MAX_BODY_BYTES} with 413 before the handler reads it. */
export const jsonBody: MiddlewareHandler = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: c => c.json(error('request body is too large'), 413) })

/** Returned by {@link readJson} for a body that is not JSON. */
export const INVALID_JSON = Symbol('invalid JSON')

/** The parsed body, or {@link INVALID_JSON}; each route answers that with its own 400, as before. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    return INVALID_JSON
  }
}
