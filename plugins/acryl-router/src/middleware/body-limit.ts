import type { Middleware, RouteContext } from '../types.ts'

export interface BodyLimitOptions {
  readonly maxBytes: number
  /** The response for a body that is too large. Defaults to a 413 with a small JSON body. */
  readonly onError?: (c: RouteContext) => Response | Promise<Response>
}

/** The context key under which the limit is kept for the body-reading helpers. */
export const BODY_LIMIT_KEY = 'bodyLimit'

/**
 * Refuse a request whose declared `content-length` is over the limit, and remember the limit so `readJson` and `readText` enforce it on the bytes
 * they read (a chunked body declares no length). A request body is a stream: only the helpers, or a handler that counts, can stop it midway.
 */
export function bodyLimit(options: BodyLimitOptions): Middleware {
  return async (c, next) => {
    const declared = Number(c.req.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      return options.onError === undefined ? c.json({ error: 'payload too large', maxBytes: options.maxBytes }, 413) : options.onError(c)
    }
    c.set(BODY_LIMIT_KEY, options.maxBytes)
    return next()
  }
}
