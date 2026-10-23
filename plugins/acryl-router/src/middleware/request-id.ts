import { randomUUID } from 'node:crypto'
import type { Middleware } from '../types.ts'
import { setHeaders } from '../util.ts'

export interface RequestIdOptions {
  /** The header read from the request and written to the response. */
  readonly header?: string
  /** Makes an id when the request brought none. */
  readonly generate?: () => string
}

const SAFE_ID = /^[\w\-=]{1,255}$/u

/** Give every request an id: the caller's, when it is well formed, otherwise a new one. It is `c.get('requestId')` and the response header. */
export function requestId(options: RequestIdOptions = {}): Middleware {
  const header = options.header ?? 'x-request-id'
  const generate = options.generate ?? randomUUID
  return async (c, next) => {
    const incoming = c.req.headers.get(header)
    const id = incoming !== null && SAFE_ID.test(incoming) ? incoming : generate()
    c.set('requestId', id)
    return setHeaders(await next(), { [header]: id })
  }
}
