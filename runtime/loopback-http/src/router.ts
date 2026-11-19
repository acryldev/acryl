/**
 * The same private-route rules on the framework's router (`acrylblends`): what every private Host route served through
 * `ctx.routerHttp.mount(prefix)` shares. Only the app's own page may call it, answers are never cached or sniffed, a wrong method is
 * 405 with its `Allow`, and a JSON body is small. The workspace, Agent Control and Desktop compose their routes with these.
 */

import { Acryl, type Context, type MiddlewareHandler } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
import { loopbackAuthority, loopbackOnly } from 'acrylblends/loopback-only'
import { methodNotAllowed } from 'acrylblends/method-not-allowed'
import { DEFAULT_MAX_BODY_BYTES, error } from './index.ts'

export type ReportError = (operation: string, cause: unknown) => void

/** The one name the Host serves its page on. */
const OWN_HOSTNAMES: readonly string[] = ['127.0.0.1']

/**
 * The app's own page, on the loopback address the Host serves it from, and nothing else: a loopback peer on the real local port, that
 * `Host`, and the exact `Origin` (a read may instead carry same-origin fetch metadata and a same-origin `Referer`). No other page and no
 * other program on the machine.
 */
export const ownPage: MiddlewareHandler = loopbackOnly({ callers: 'own-page', hostnames: OWN_HOSTNAMES })

/**
 * A WebSocket upgrade from the app's own page: {@link ownPage}, and always the exact `Origin`. A browser sends `Origin` on every handshake, and a
 * socket changes things (keystrokes go up it), so the `Referer` a read may show instead is not enough. A refusal is a plain 403 before any handshake.
 */
export const ownPageSocket: MiddlewareHandler = async (c, next) => {
  const authority = loopbackAuthority(c, OWN_HOSTNAMES)
  if (authority === undefined || c.req.header('origin') !== authority.origin) return c.json(error('forbidden'), 403)
  return ownPage(c, next)
}

/** The headers every private answer carries, set after the handler so a refusal carries them too. */
export const privateHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('cache-control', 'no-store')
  c.header('x-content-type-options', 'nosniff')
}

/**
 * A plugin's private routes as one app: each domain's routes, every answer with {@link privateHeaders}, and a known path asked with
 * another method answered 405 with its `Allow` before any guard runs. The middleware is scoped to the plugin's prefixes, so it never
 * wraps another plugin's routes.
 */
export function privateApi(prefixes: string | readonly string[], ...routes: readonly Acryl[]): Acryl {
  const app = new Acryl()
  for (const prefix of typeof prefixes === 'string' ? [prefixes] : prefixes) {
    app.use(`${prefix}/*`, privateHeaders, methodNotAllowed({
      app,
      onMethodNotAllowed: (c, allowed) => c.json(error('method not allowed'), 405, { allow: allowed.join(', ') }),
    }))
  }
  for (const domain of routes) app.route('/', domain)
  return app
}

/** A changing request must declare a JSON body (`application/json`, any parameters): 415 otherwise, the rule `isJsonRequest` keeps on node:http. */
export const jsonContent: MiddlewareHandler = async (c, next) => {
  if (c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return c.json(error('content type must be application/json'), 415)
  }
  await next()
}

/** Refuse a body over `maxBytes` with 413 before the handler reads it. */
export function jsonBody(maxBytes: number = DEFAULT_MAX_BODY_BYTES): MiddlewareHandler {
  return bodyLimit({ maxSize: maxBytes, onError: c => c.json(error('request body is too large'), 413) })
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
