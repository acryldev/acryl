/**
 * The page channel on the router: an event stream down to the page and POST up, so it needs no WebSocket upgrade on any adapter.
 *
 * `GET <prefix>/channel?window=<id>&focused=0|1` is the page's stream. The Host writes each call as `event: call` and a `ping` every
 * heartbeat, so a page that hears nothing for a while knows the stream died and reconnects. `POST <prefix>/channel/answer` carries
 * `{ window, message }` (a result, an error or a focus change). Both are for the app's own page only (same origin, loopback).
 */

import { Acryl } from 'acryl-router'
import { streamSSE } from 'acryl-router/helpers'
import { loopbackOnly } from 'acryl-router/middleware'
import { parseChannelToHost, WINDOW_ID } from '../page/protocol.ts'
import type { UiChannel } from './channel.ts'
import { error, INVALID_JSON, jsonBody, ownPage, readJson } from './http.ts'

/** How often the Host writes a `ping`; the page gives up on a stream that is silent for three of these. */
export const HEARTBEAT_MS = 15_000

export interface PageRoutesOptions {
  /** Where the channel lives, e.g. `/api/acryl-door`. */
  readonly prefix: string
  readonly heartbeatMs?: number
  /** The only hostnames the page may be served from (default: every loopback name), e.g. `['127.0.0.1']` for a Host that serves only that. */
  readonly hostnames?: readonly string[]
}

export function pageChannelRoutes(channel: UiChannel, options: PageRoutesOptions): Acryl {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
  const page = options.hostnames === undefined ? ownPage : loopbackOnly({ callers: 'own-page', hostnames: options.hostnames })
  return new Acryl()
    .get(`${options.prefix}/channel`, page, (c) => {
      const windowId = c.req.query('window')
      if (windowId === undefined || !WINDOW_ID.test(windowId)) return c.json(error('a window id is required'), 400)
      const focused = c.req.query('focused') === '1'
      const signal = c.req.raw.signal
      return streamSSE(c, async (stream) => {
        let end = (): void => {}
        const ended = new Promise<void>((resolve) => { end = resolve })
        stream.onAbort(end)
        signal.addEventListener('abort', end, { once: true })
        const write = (event: string, data: string): void => {
          stream.writeSSE({ event, data }).catch(end)
        }
        const detach = channel.attach(windowId, focused, { send: (data) => { write('call', data) }, close: end })
        const beat = setInterval(() => { write('ping', '') }, heartbeatMs)
        try {
          write('ready', '')
          await ended
        } finally {
          clearInterval(beat)
          signal.removeEventListener('abort', end)
          detach()
        }
      })
    })
    .post(`${options.prefix}/channel/answer`, page, jsonBody, async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON || typeof body !== 'object' || body === null) return c.json(error('invalid request body'), 400)
      const { window: windowId, message } = body as { window?: unknown; message?: unknown }
      const parsed = parseChannelToHost(message)
      if (typeof windowId !== 'string' || !WINDOW_ID.test(windowId) || parsed === null) return c.json(error('invalid message'), 400)
      channel.receive(windowId, parsed)
      return c.body(null, 204)
    })
}
