/**
 * The page channel over a WebSocket. An event stream (`page-routes.ts`) holds one of the browser's six connections per host for as long as the page lives; two windows of an app that
 * also stream their own state, with the panel following a run, use them all, and then no request of either window is sent (the door's answers, Stop). A WebSocket is not one of
 * those six: it opens at once however many streams are open, and the page's answers travel on it too, so nothing is queued behind a stream.
 *
 * `GET <prefix>/channel/ws?window=<id>&focused=0|1[&shell=<n>]` upgrades. The messages are the same JSON as the stream's: down, `{ "e": "call", "d": "<the call>" }` and
 * `{ "e": "ready" }` / `{ "e": "ping" }`; up, one {@link ChannelToHost} message per frame. A WebSocket has no CORS, so the `Origin` header is the boundary: it must be present and be
 * exactly this app's own origin, or the upgrade is refused (403) before any handshake. A page on another port, a web site, and a program that sends no `Origin` are all refused.
 */

import { Acryl, type MiddlewareHandler } from 'acryl-router'
import type { UpgradeWebSocket, WSEvents } from 'acryl-router/helpers'
import { pageAuthority } from 'acryl-router/middleware'
import { parseChannelToHost, WINDOW_ID } from '../page/protocol.ts'
import type { UiChannel } from './channel.ts'
import { error } from './http.ts'

/** How often the Host writes a `ping`; the page gives up on a socket that is silent for three of these. */
export const SOCKET_HEARTBEAT_MS = 15_000

export interface PageSocketOptions {
  readonly prefix: string
  /** The live upgrade helper: the route is mounted once, so the helper is read per request (a restarting host has a new one). */
  readonly upgrade: () => UpgradeWebSocket | undefined
  readonly heartbeatMs?: number
}

/** The upgrade request comes from this app's own page: a loopback peer on this port (or the hosted app's trusted front), and an `Origin` that is exactly this app's origin. Nothing else is read as proof. */
export const ownOrigin: MiddlewareHandler = async (c, next) => {
  const authority = pageAuthority(c)
  const origin = c.req.header('origin')
  const site = c.req.header('sec-fetch-site')
  if (authority === undefined || origin === undefined || origin !== authority.origin || (site !== undefined && site !== 'same-origin')) {
    return c.json(error('only this app\'s own page may open the channel'), 403)
  }
  const windowId = c.req.query('window')
  if (windowId === undefined || !WINDOW_ID.test(windowId)) return c.json(error('a window id is required'), 400)
  await next()
}

export function pageSocketRoutes(channel: UiChannel, options: PageSocketOptions): Acryl {
  const heartbeatMs = options.heartbeatMs ?? SOCKET_HEARTBEAT_MS
  const events = (c: Parameters<MiddlewareHandler>[0]): WSEvents => {
      const windowId = c.req.query('window') as string
      const focused = c.req.query('focused') === '1'
      const shellQuery = Number(c.req.query('shell'))
      const shellWindow = Number.isSafeInteger(shellQuery) && shellQuery > 0 ? shellQuery : undefined
      const tabQuery = c.req.query('tab')
      const tab = tabQuery !== undefined && WINDOW_ID.test(tabQuery) ? tabQuery : undefined
      let detach: (() => void) | undefined
      let beat: NodeJS.Timeout | undefined
      return {
        onOpen(_event, ws) {
          const write = (frame: { e: string; d?: string }): void => {
            ws.send(JSON.stringify(frame))
          }
          // A call that cannot be written fails at once (`disconnected`), and a socket that is gone is dropped by its close: the door never holds a call for it.
          detach = channel.attach(windowId, focused, { send: data => { write({ e: 'call', d: data }) }, notify: (event, data) => { write({ e: event, d: data }) }, close: () => { ws.close(1000, 'replaced') } }, shellWindow, tab)
          write({ e: 'ready' })
          beat = setInterval(() => {
            try { write({ e: 'ping' }) } catch { /* the close event follows */ }
          }, heartbeatMs)
        },
        onMessage(event) {
          if (typeof event.data !== 'string') return
          let message: unknown
          try { message = JSON.parse(event.data) } catch { return }
          const parsed = parseChannelToHost(message)
          if (parsed !== null) channel.receive(windowId, parsed)
        },
        onClose() {
          if (beat !== undefined) clearInterval(beat)
          detach?.()
        },
      }
  }
  // Mounted once, ahead of the private routes: the route must keep its precedence across a host restart, so the middleware asks for the live helper
  // at request time and refuses cleanly while none is ready.
  return new Acryl().get(
    `${options.prefix}/channel/ws`,
    ownOrigin,
    async (c, next) => {
      const allow = options.upgrade()
      if (allow === undefined) return c.json(error('the page channel is not ready yet'), 503)
      return allow(events, { textOnly: true })(c, next)
    },
  )
}
