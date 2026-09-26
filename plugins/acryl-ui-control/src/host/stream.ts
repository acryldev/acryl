/**
 * The WebSocket a page opens to the Host so the agent can drive it.
 *
 * The same loopback same-origin rule as every private route applies to the upgrade, and a page from another
 * origin is refused (a WebSocket is not covered by the browser's same-origin policy on its own).
 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseChannelToHost } from '../contract.ts'
import type { UiChannel } from './channel.ts'

export const UI_CONTROL_CHANNEL_PATH = '/api/acryl-ui-control/channel'

const MAX_FRAME_BYTES = 1024 * 1024
const PING_MS = 30_000

export interface UiControlStream {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
  close(): void
}

export function createUiControlStream(channel: UiChannel, expectedOrigin: string): UiControlStream {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false })
  return {
    handleUpgrade(req, socket, head) {
      if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\ncontent-length: 0\r\n\r\n')
        return
      }
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        const page = channel.attach({ send: data => { ws.send(data) }, close: () => { ws.close(1001, 'going away') } })
        ws.on('message', (raw, isBinary) => {
          if (isBinary) return
          const message = parseChannelToHost(raw.toString('utf8'))
          if (message === null) { ws.close(1008, 'invalid message'); return }
          page.onMessage(message)
        })
        let alive = true
        ws.on('pong', () => { alive = true })
        const ping = setInterval(() => {
          if (!alive) { ws.terminate(); return }
          alive = false
          ws.ping()
        }, PING_MS)
        ws.on('error', () => { /* the close event that follows settles pending calls */ })
        ws.on('close', () => { clearInterval(ping); page.onClose() })
      })
    },
    close() {
      for (const client of wss.clients) client.close(1001, 'going away')
      wss.close()
    },
  }
}
