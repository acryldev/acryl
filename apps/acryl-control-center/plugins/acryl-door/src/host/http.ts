/**
 * What every door route shares (moved from `acryl-agent-control`, spec 041). Two kinds of caller reach it, each with its own guard: the
 * app's own page (same origin, on a loopback address), and an operator on this machine (`.acryl/bin/acryl`, an agent's shell) presenting
 * this run's secret.
 */

import { timingSafeEqual } from 'node:crypto'
import { Acryl, type Context, type MiddlewareHandler } from '../../../acryl-router/src/index.ts'
import { bodyLimit, loopbackAuthority, loopbackOnly, methodNotAllowed } from '../../../acryl-router/src/middleware/index.ts'

/** Every door route lives below this path. */
export const DOOR_PREFIX = '/api/acryl-door'

/** The cap on a JSON request body. */
export const MAX_BODY_BYTES = 64 * 1024

export type ReportError = (operation: string, cause: unknown) => void

/** The JSON body of a refusal. */
export function error(message: string): { readonly error: string } {
  return { error: message }
}

/** The app's own page, on a loopback address, and nothing else: another origin, another port and a script on the machine are refused. */
export const ownPage: MiddlewareHandler = loopbackOnly({ callers: 'own-page' })

/** A constant-time comparison of a `Bearer` header with the secret. */
export function tokenMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Only an operator on this machine: a loopback peer addressing this server's own port (`loopbackAuthority`), presenting this run's
 * secret. Anything else is 403 `forbidden`, which the client reads as "refused: the app restarted and the secret rotated?".
 */
export function operatorOnly(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (loopbackAuthority(c) === undefined || !tokenMatches(c.req.header('authorization'), secret)) return c.json(error('forbidden'), 403)
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
 * The door's routes as one app: each part's routes, every answer with the private headers, and a known path asked with another method
 * answered 405 with its `Allow` before any guard runs. The middleware is scoped to the prefix, so it never wraps another plugin's routes.
 */
export function privateApi(prefix: string, ...routes: readonly Acryl[]): Acryl {
  const app = new Acryl()
  app.use(`${prefix}/*`, privateHeaders, methodNotAllowed({
    app,
    onMethodNotAllowed: (c, allowed) => c.json(error('method not allowed'), 405, { allow: allowed.join(', ') }),
  }))
  for (const part of routes) app.route('/', part)
  return app
}

/** Refuse a body over {@link MAX_BODY_BYTES} with 413 before the handler reads it. */
export const jsonBody: MiddlewareHandler = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: c => c.json(error('request body is too large'), 413) })

/** Returned by {@link readJson} for a body that is not JSON. */
export const INVALID_JSON = Symbol('invalid JSON')

/** The parsed body, or {@link INVALID_JSON}. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    return INVALID_JSON
  }
}
