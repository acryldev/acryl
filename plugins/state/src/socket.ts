/**
 * State over a WebSocket. A server-sent event stream holds one of the browser's six connections per host for as long as the page lives, and an app that follows a few keys in
 * several windows uses them all; a WebSocket is not one of those six, and one socket carries every key of a page.
 *
 * `GET /api/state/ws` upgrades. Up, one JSON message per frame: `{ "t": "sub", "key": "<key>" }` and `{ "t": "unsub", "key": "<key>" }`. Down: `{ "key": "<key>", "value": <json> }` once on
 * `sub` and after every change, `{ "key": "<key>", "error": "<why>" }` for a key that cannot be followed, and `{ "t": "ping" }` every {@link SOCKET_HEARTBEAT_MS} so a page can tell a quiet
 * socket from a dead one. `GET /api/state/client.js` is the browser module that speaks this (`watch(key, callback)`), with the event stream as its fallback.
 *
 * A WebSocket has no CORS, so the upgrade is checked here ({@link refuseStranger}): a loopback peer on this port with a loopback `Host`, and an `Origin` that, when the request has one,
 * is exactly this app's own origin. A program on this machine that sends no `Origin` (a script, a test) is let in, as it is for the JSON and stream routes; a web page of another
 * origin, and a name that only resolves to this machine (DNS rebinding), are not.
 */

import type { Context, MiddlewareHandler } from 'acryl-router'
import type { UpgradeWebSocket } from 'acryl-router/helpers'
import { pageAuthority } from 'acryl-router/middleware'
import type { ReadonlyCell } from './cell.ts'

/** How often the server writes a `ping`; a page gives up on a socket that is silent for three of these. */
export const SOCKET_HEARTBEAT_MS = 15_000

/** How many keys one socket may follow; a page watches a handful. */
export const MAX_KEYS_PER_SOCKET = 256

/** What the socket needs of the state service. */
export interface Cells {
  find(key: string): ReadonlyCell<unknown> | undefined
}

export interface StateSocketOptions {
  readonly upgrade: UpgradeWebSocket
  readonly heartbeatMs?: number
}

/** A refusal (403) unless the upgrade comes from this machine to this app, and from its own page when it comes from a page at all. */
export function refuseStranger(c: Context): Response | undefined {
  const authority = pageAuthority(c)
  if (authority === undefined) return c.json({ error: 'request authority rejected' }, 403)
  const origin = c.req.header('origin')
  const site = c.req.header('sec-fetch-site')
  if ((origin !== undefined && origin !== authority.origin) || (site !== undefined && site !== 'same-origin')) {
    return c.json({ error: 'only this app\'s own page may follow its state' }, 403)
  }
  return undefined
}

/** The route handler that upgrades and follows keys of `cells` for as long as the socket is open. */
export function stateSocket(cells: Cells, options: StateSocketOptions): MiddlewareHandler {
  const heartbeatMs = options.heartbeatMs ?? SOCKET_HEARTBEAT_MS
  return options.upgrade(() => {
    const following = new Map<string, () => void>()
    let beat: NodeJS.Timeout | undefined
    return {
      onOpen(_event, ws) {
        beat = setInterval(() => {
          try { ws.send(JSON.stringify({ t: 'ping' })) } catch { /* the close event follows */ }
        }, heartbeatMs)
        beat.unref()
      },
      onMessage(event, ws) {
        if (typeof event.data !== 'string') return
        let message: { t?: unknown, key?: unknown }
        try { message = JSON.parse(event.data) as typeof message } catch { return }
        if (typeof message.key !== 'string') return
        const key = message.key
        const tell = (frame: object): void => {
          try { ws.send(JSON.stringify(frame)) } catch { /* the close event follows */ }
        }
        const value = (current: unknown): void => {
          let text: string
          try { text = JSON.stringify({ key, value: current === undefined ? null : current }) } catch { tell({ key, error: 'the value cannot be sent as JSON' }); return }
          try { ws.send(text) } catch { /* the close event follows */ }
        }
        if (message.t === 'unsub') {
          following.get(key)?.()
          following.delete(key)
          return
        }
        if (message.t !== 'sub') return
        const cell = cells.find(key)
        if (cell === undefined) { tell({ key, error: 'no such state' }); return }
        const known = following.has(key)
        if (!known && following.size >= MAX_KEYS_PER_SOCKET) { tell({ key, error: 'too many keys on one socket' }); return }
        // A key asked for twice is answered again with its value, and followed once.
        if (known) { value(cell.get()); return }
        value(cell.get())
        following.set(key, cell.subscribe(value))
      },
      onClose() {
        if (beat !== undefined) clearInterval(beat)
        for (const stop of following.values()) stop()
        following.clear()
      },
    }
  }, { textOnly: true })
}
