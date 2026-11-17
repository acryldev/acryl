import { BlockList, isIP } from 'node:net'
import { connectionOf } from '../connection.ts'
import type { Context } from '../core/context.ts'
import type { MiddlewareHandler } from '../core/types.ts'

export interface LoopbackOptions {
  /** Hostnames a `Host` header may name. Default: the loopback names `127.0.0.1`, `localhost` and `[::1]`. */
  readonly hostnames?: readonly string[]
  /**
   * What a request that changes things (not GET, HEAD or OPTIONS) must show: `same-origin` (default) refuses an `Origin` header that is not this same
   * authority (including `null`), which stops another web page from driving a local app. A browser always sends `Origin` on a cross-origin change, so a
   * request with no `Origin` (curl, a script) is allowed: the `Host` it names is already checked to be a loopback address with this server's port, which
   * is what stops DNS rebinding. `none` checks only the peer and the `Host`.
   */
  readonly mutations?: 'same-origin' | 'none'
  /**
   * A call made inside the process (the terminal UI, a test) has no socket, so no peer to check. `deny` (default) refuses it, the safe choice for a route
   * that guards something; `allow` lets it through for routes whose in-process caller is the host's own code. A request that came over a socket is always
   * checked in full: only a call with no connection facts at all counts as in process.
   */
  readonly inProcess?: 'deny' | 'allow'
  /**
   * Who may call. `local` (default): any program on this machine, a browser page only as `mutations` allows. `own-page`: only this app's own page,
   * for private routes a script on the machine must not drive or read either. A request then shows an `Origin` that is exactly this authority (with
   * `Sec-Fetch-Site` absent or `same-origin`), or, for a read (GET, HEAD, OPTIONS), which browsers often send without `Origin`, `Sec-Fetch-Site:
   * same-origin` and a `Referer` from this authority. `mutations` is not consulted: every request is held to that rule.
   */
  readonly callers?: 'local' | 'own-page'
  /** The hosted app's trusted front; default: the one the environment configures ({@link trustedFront}), usually none. Tests pass one. */
  readonly front?: TrustedFront | undefined
}

const loopback = new BlockList()
loopback.addSubnet('127.0.0.0', 8, 'ipv4')
loopback.addSubnet('::1', 128, 'ipv6')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The authority a loopback request addressed: the `Host` header as a URL, or `undefined` when the request does not come from a loopback peer to the
 * real local port, names another host, or is marked cross-site by the browser. The peer and the port come from the transport (`connectionOf(c)`), never
 * from a header; an in-process call has neither and is refused.
 */
export const LOOPBACK_HOSTNAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]']

export function loopbackAuthority(c: Context, hostnames: readonly string[] = LOOPBACK_HOSTNAMES): URL | undefined {
  const { remoteAddress, localPort } = connectionOf(c)
  const host = c.req.header('host')
  if (remoteAddress === undefined || localPort === undefined || host === undefined) return undefined
  const address = peerAddress(remoteAddress)
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
    || c.req.header('sec-fetch-site') === 'cross-site'
  ) return undefined
  return authority
}

/**
 * A hosted app's one trusted front (spec 049 M9, design `m9-hosted-workspace.md` C): the reverse proxy that serves this app's page under a public
 * origin, for example `https://a1b2.213-47-80-26.sslip.io`. Only the hosting template sets it, through `ACRYL_PUBLIC_ORIGIN` and
 * `ACRYL_TRUSTED_PROXY` (the proxy's exact peer addresses, comma separated). Unset, nothing changes: an app accepts its own page on loopback only.
 */
export interface TrustedFront {
  /** The public origin the front serves this app's page from: a scheme and a host, no path. */
  readonly origin: string
  /** The exact peer addresses the front connects from; no ranges, so another box on the same network is never the front. */
  readonly proxies: readonly string[]
}

/** The front the environment configures, or `undefined` when it configures none or an invalid one (an invalid one is refused, never half used). */
export function trustedFrontFromEnv(env: NodeJS.ProcessEnv = process.env): TrustedFront | undefined {
  const origin = env.ACRYL_PUBLIC_ORIGIN?.trim()
  const proxies = (env.ACRYL_TRUSTED_PROXY ?? '').split(',').map(peer => peerAddress(peer.trim())).filter(peer => peer !== '')
  if (origin === undefined || origin === '' || proxies.length === 0) return undefined
  if (originOf(origin) !== origin || !/^https?:$/u.test(new URL(origin).protocol)) return undefined
  if (proxies.some(peer => isIP(peer) === 0)) return undefined
  return Object.freeze({ origin, proxies: Object.freeze(proxies) })
}

let configuredFront: TrustedFront | undefined | null = null

/** The front of this process, read from the environment once. */
export function trustedFront(): TrustedFront | undefined {
  if (configuredFront === null) configuredFront = trustedFrontFromEnv()
  return configuredFront
}

function peerAddress(address: string): string {
  return (address.replace(/^\[|\]$/gu, '').split('%', 1)[0] ?? '').replace(/^::ffff:/iu, '')
}

/**
 * The public authority of a request the trusted front passed on: the peer is exactly one of the front's addresses, the `Host` is exactly the
 * public host, and the browser did not mark it cross-site. Anything else, or no front, gives `undefined`. The peer comes from the transport, never a
 * header, so a page on another box cannot claim to be the front.
 */
export function frontAuthority(c: Context, front: TrustedFront | undefined = trustedFront()): URL | undefined {
  if (front === undefined) return undefined
  const { remoteAddress } = connectionOf(c)
  if (remoteAddress === undefined || !front.proxies.includes(peerAddress(remoteAddress))) return undefined
  const publicOrigin = new URL(front.origin)
  if (c.req.header('host') !== publicOrigin.host || c.req.header('sec-fetch-site') === 'cross-site') return undefined
  return publicOrigin
}

/**
 * The authority a browser page of this app reached it under: the loopback one, or the trusted front's public one. For routes a page calls; an
 * operator route (the door's `.acryl/bin/acryl` calls) keeps {@link loopbackAuthority}, so nothing outside the box can operate the app.
 */
export function pageAuthority(
  c: Context,
  hostnames: readonly string[] = LOOPBACK_HOSTNAMES,
  front: TrustedFront | undefined = trustedFront(),
): URL | undefined {
  return loopbackAuthority(c, hostnames) ?? frontAuthority(c, front)
}

/** Whether a changing request is acceptable by its `Origin`: absent (not a browser cross-origin change) or naming this same authority. `null` and any other origin are not. */
export function sameOrigin(c: Context, authority: URL): boolean {
  const origin = c.req.header('origin')
  if (origin === undefined) return true
  try {
    const parsed = new URL(origin)
    return parsed.origin === authority.origin && parsed.pathname === '/' && parsed.search === ''
  } catch {
    return false
  }
}

function originOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

/** Whether the request comes from a page served by this authority itself: the `own-page` rule of {@link LoopbackOptions.callers}. */
export function fromOwnPage(c: Context, authority: URL): boolean {
  const origin = c.req.header('origin')
  const fetchSite = c.req.header('sec-fetch-site')
  if (origin !== undefined && originOf(origin) === origin && origin === authority.origin) return fetchSite === undefined || fetchSite === 'same-origin'
  return SAFE_METHODS.has(c.req.method) && fetchSite === 'same-origin' && originOf(c.req.header('referer')) === authority.origin
}

/**
 * Only requests from this machine to this app: loopback peer, the real port, an allowed `Host`, and for mutations a matching `Origin` (with
 * `callers: 'own-page'`, every request from this app's own page). Everything else gets a 403.
 */
export function loopbackOnly(options: LoopbackOptions = {}): MiddlewareHandler {
  const mutations = options.mutations ?? 'same-origin'
  const inProcess = options.inProcess ?? 'deny'
  const ownPage = options.callers === 'own-page'
  return async (c, next) => {
    const connection = connectionOf(c)
    if (inProcess === 'allow' && connection.remoteAddress === undefined && connection.localPort === undefined) {
      await next()
      return
    }
    const authority = pageAuthority(c, options.hostnames, 'front' in options ? options.front : trustedFront())
    if (authority === undefined) return c.json({ error: 'request authority rejected' }, 403)
    if (ownPage) {
      if (!fromOwnPage(c, authority)) return c.json({ error: 'only this app\'s own page may call this' }, 403)
      await next()
      return
    }
    if (mutations === 'same-origin' && !SAFE_METHODS.has(c.req.method) && !sameOrigin(c, authority)) {
      return c.json({ error: 'a change must come from this app\'s own origin' }, 403)
    }
    await next()
  }
}
