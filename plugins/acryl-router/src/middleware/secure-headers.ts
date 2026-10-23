import type { Middleware } from '../types.ts'
import { setHeaders } from '../util.ts'

export interface SecureHeadersOptions {
  /** Extra or replacement headers, merged over the defaults. A value of `''` removes a default. */
  readonly headers?: Readonly<Record<string, string>>
}

const DEFAULTS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
}

/** Add the standard hardening headers to every response (never overriding one the handler already set). */
export function secureHeaders(options: SecureHeadersOptions = {}): Middleware {
  const wanted = Object.entries({ ...DEFAULTS, ...options.headers }).filter(([, value]) => value !== '')
  return async (_c, next) => {
    const response = await next()
    return setHeaders(response, Object.fromEntries(wanted.filter(([name]) => !response.headers.has(name))))
  }
}
