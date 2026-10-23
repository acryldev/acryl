import { BlockList, isIP } from 'node:net'
import type { Middleware, RouteContext } from '../types.ts'

export interface LoopbackOptions {
  /** Hostnames a `Host` header may name. Default: `127.0.0.1`, the one origin an ACRYL app serves itself on. */
  readonly hostnames?: readonly string[]
  /**
   * What a request that changes things (not GET, HEAD or OPTIONS) must show: `same-origin` (default) requires an `Origin` header naming this same
   * authority, which stops another web page from driving a local app; `none` checks only the peer and the `Host`.
   */
  readonly mutations?: 'same-origin' | 'none'
}

const loopback = new BlockList()
loopback.addSubnet('127.0.0.0', 8, 'ipv4')
loopback.addSubnet('::1', 128, 'ipv6')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The authority a loopback request addressed: the `Host` header as a URL, or `undefined` when the request does not come from a loopback peer to the
 * real local port, names another host, or is marked cross-site by the browser. The peer and the port come from the transport (`c.connection`), never
 * from a header; an in-process call has neither and is refused.
 */
export function loopbackAuthority(c: RouteContext, hostnames: readonly string[] = ['127.0.0.1']): URL | undefined {
  const { remoteAddress, localPort } = c.connection
  const host = c.req.headers.get('host')
  if (remoteAddress === undefined || localPort === undefined || host === null) return undefined
  const address = (remoteAddress.replace(/^\[|\]$/gu, '').split('%', 1)[0] ?? '').replace(/^::ffff:/iu, '')
  const family = isIP(address)
  if (family === 0 || !loopback.check(address, family === 4 ? 'ipv4' : 'ipv6')) return undefined
  let authority: URL
  try {
    authority = new URL(`http://${host}`)
  } catch {
    return undefined
  }
  if (
    authority.protocol !== 'http:'
    || Number(authority.port || '80') !== localPort
    || !hostnames.includes(authority.hostname)
    || c.req.headers.get('sec-fetch-site') === 'cross-site'
  ) return undefined
  return authority
}

/** Whether a changing request names this same authority as its `Origin`. */
export function sameOrigin(c: RouteContext, authority: URL): boolean {
  const origin = c.req.headers.get('origin')
  if (origin === null) return false
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'http:' && parsed.host === authority.host && parsed.pathname === '/'
  } catch {
    return false
  }
}

/** Only requests from this machine to this app: loopback peer, the real port, an allowed `Host`, and for mutations a matching `Origin`. Everything else gets a 403. */
export function loopbackOnly(options: LoopbackOptions = {}): Middleware {
  const mutations = options.mutations ?? 'same-origin'
  return async (c, next) => {
    const authority = loopbackAuthority(c, options.hostnames)
    if (authority === undefined) return c.json({ error: 'request authority rejected' }, 403)
    if (mutations === 'same-origin' && !SAFE_METHODS.has(c.req.method) && !sameOrigin(c, authority)) {
      return c.json({ error: 'a change must come from this app\'s own origin' }, 403)
    }
    return next()
  }
}
