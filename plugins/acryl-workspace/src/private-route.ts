/**
 * What every workspace route shares, on the router: only the app's own page may call it, answers are never cached or sniffed, and a JSON
 * body is small. Each domain folder builds its routes with these and `index.ts` mounts them under {@link WORKSPACE_API_PREFIX}.
 */

import { Acryl, type Context, type MiddlewareHandler } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
import { loopbackOnly } from 'acrylblends/loopback-only'
import { methodNotAllowed } from 'acrylblends/method-not-allowed'

/** Every workspace route lives below this path; it is the one prefix the plugin mounts on the Web server. */
export const WORKSPACE_API_PREFIX = '/api/acryl-workspace'

/** The default cap on a JSON request body. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024

export type ReportError = (operation: string, cause: unknown) => void

/** The app's own page, on the loopback address the Host serves it from, and nothing else: no other page and no other program on the machine. */
export const ownPage: MiddlewareHandler = loopbackOnly({ callers: 'own-page', hostnames: ['127.0.0.1'] })

/** The headers every private answer carries, set after the handler so a refusal carries them too. */
export const privateHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('cache-control', 'no-store')
  c.header('x-content-type-options', 'nosniff')
}

/**
 * The workspace's routes as one app: each domain's routes, every answer with {@link privateHeaders}, and a known path asked with another
 * method answered 405 with its `Allow`. The middleware is scoped to {@link WORKSPACE_API_PREFIX}, so it never wraps another plugin's routes.
 */
export function privateApi(...routes: readonly Acryl[]): Acryl {
  const app = new Acryl()
  app.use(`${WORKSPACE_API_PREFIX}/*`, privateHeaders, methodNotAllowed({
    app,
    onMethodNotAllowed: (c, allowed) => c.json(failure('method not allowed'), 405, { allow: allowed.join(', ') }),
  }))
  for (const domain of routes) app.route('/', domain)
  return app
}

/** Refuse a body over `maxBytes` with 413 before the handler reads it. */
export function jsonBody(maxBytes: number = DEFAULT_MAX_BODY_BYTES): MiddlewareHandler {
  return bodyLimit({ maxSize: maxBytes, onError: c => c.json(failure('body too large'), 413) })
}

/** Returned by {@link readJson} for a body that is not JSON. */
export const INVALID_JSON = Symbol('invalid JSON')

/** The parsed body, or {@link INVALID_JSON}; the route answers that with its own 400. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    return INVALID_JSON
  }
}

export function failure(message: string): { readonly error: string } {
  return { error: message }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
