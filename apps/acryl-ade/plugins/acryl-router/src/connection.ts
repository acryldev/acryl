/**
 * Transport facts: who is on the other end of the socket and which local port it reached. The caller of `router.fetch` supplies them
 * (an HTTP adapter passes the socket's peer address and real port); they travel in `c.env.connection`, beside the request and never in a header.
 */

import { isIP } from 'node:net'
import type { Context } from './core/context.ts'
import type { ConnInfo, GetConnInfo } from './core/helper/conninfo/types.ts'

/** An in-process caller (the terminal UI, a test) passes nothing, so a handler that needs a trusted peer must refuse an empty one. */
export interface ConnectionInfo {
  /** The peer address of the socket, when the request came over one (for example `127.0.0.1`). */
  readonly remoteAddress?: string | undefined
  /** The local port the socket is connected to, the real one a `Host` header should be checked against. */
  readonly localPort?: number | undefined
}

/** What the router puts in `c.env`. */
export interface RouterBindings {
  readonly connection: ConnectionInfo
}

/** The `Env` of an `Acryl` that wants `c.env.connection` typed: `new Acryl<RouterEnv>()`. */
export interface RouterEnv {
  Bindings: RouterBindings
}

const NONE: ConnectionInfo = Object.freeze({})

/** The transport facts of this request; empty for an in-process call or an `Acryl` run outside the router. */
export function connectionOf(c: Context): ConnectionInfo {
  const env = c.env as Partial<RouterBindings> | undefined
  return env?.connection ?? NONE
}

/** The peer in the core's conninfo shape, for middleware written against it (for example `ipRestriction`). */
export const getConnInfo: GetConnInfo = (c): ConnInfo => {
  const { remoteAddress } = connectionOf(c)
  if (remoteAddress === undefined) return { remote: {} }
  const family = isIP(remoteAddress.replace(/^\[|\]$/gu, ''))
  return { remote: { transport: 'tcp', address: remoteAddress, addressType: family === 6 ? 'IPv6' : family === 4 ? 'IPv4' : undefined } }
}
