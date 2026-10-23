import type { Middleware } from '../types.ts'
import { appendVary, setHeaders } from '../util.ts'

export interface CorsOptions {
  /** `'*'`, one origin, a list, or a function that returns the origin to allow (or `undefined` to refuse). */
  readonly origin?: string | readonly string[] | ((origin: string) => string | undefined)
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly exposeHeaders?: readonly string[]
  readonly maxAge?: number
  readonly credentials?: boolean
}

const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']

/** Cross-origin resource sharing, with preflight answered here (a 204 that never reaches the route). */
export function cors(options: CorsOptions = {}): Middleware {
  const allowed = (origin: string): string | undefined => {
    const rule = options.origin ?? '*'
    if (typeof rule === 'function') return rule(origin)
    if (typeof rule === 'string') return rule === '*' || rule === origin ? rule : undefined
    return rule.includes(origin) ? origin : undefined
  }
  return async (c, next) => {
    const origin = c.req.headers.get('origin')
    const match = origin === null ? undefined : allowed(origin)
    const shared: Record<string, string> = {}
    if (match !== undefined) shared['access-control-allow-origin'] = match
    if (options.credentials === true && match !== undefined) shared['access-control-allow-credentials'] = 'true'
    if (options.exposeHeaders !== undefined && options.exposeHeaders.length > 0) shared['access-control-expose-headers'] = options.exposeHeaders.join(',')

    if (c.req.method === 'OPTIONS' && c.req.headers.has('access-control-request-method')) {
      const headers = { ...shared }
      if (match !== undefined) {
        headers['access-control-allow-methods'] = (options.allowMethods ?? DEFAULT_METHODS).join(',')
        const requested = c.req.headers.get('access-control-request-headers')
        const allowHeaders = options.allowHeaders ?? (requested === null ? [] : requested.split(',').map(part => part.trim()))
        if (allowHeaders.length > 0) headers['access-control-allow-headers'] = allowHeaders.join(',')
        if (options.maxAge !== undefined) headers['access-control-max-age'] = String(options.maxAge)
      }
      return appendVary(c.body(null, 204, headers), 'Origin')
    }
    const response = await next()
    return appendVary(setHeaders(response, shared), 'Origin')
  }
}
