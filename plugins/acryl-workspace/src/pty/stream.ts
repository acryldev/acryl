/**
 * The live terminal stream: one WebSocket per open terminal view.
 *
 * Output goes down and keystrokes and size changes go up over one ordered connection, so nothing is
 * polled, nothing is re-sent, and two keystrokes can never arrive swapped. The same-origin loopback rule
 * that guards the HTTP routes guards the upgrade too, and a browser page from another origin is refused
 * (a WebSocket is not covered by the same-origin policy on its own).
 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { isSameOriginLoopbackRequest } from '../http.ts'
import { parsePtyClientMessage, type PtyServerMessage } from './contract.ts'
import type { WorkspacePtyRegistry } from './service.ts'

/** Output is sent in batches this far apart, so a burst of small writes becomes one frame. */
const BATCH_MS = 4
/** When the socket already holds this much unsent data, wait instead of piling on. */
const BACKPRESSURE_BYTES = 1024 * 1024
/** A client this far behind is dropped; it reconnects and resumes from its cursor. */
const MAX_PENDING_CHARS = 8 * 1024 * 1024
const PING_MS = 30_000
const MAX_FRAME_BYTES = 512 * 1024

type ReportError = (operation: string, cause: unknown) => void

export interface WorkspacePtyStream {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
  /** Close every open stream (the Host plugin is unloading). */
  close(): void
}

export function createWorkspacePtyStream(
  registry: WorkspacePtyRegistry,
  expectedOrigin: string,
  reportError: ReportError,
): WorkspacePtyStream {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false })

  function refuse(socket: Duplex, status: string): void {
    socket.end(`HTTP/1.1 ${status}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`)
  }

  function attach(ws: WebSocket, id: string, since: number): void {
    const send = (message: PtyServerMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
    }
    let pending = ''
    let pendingCursor = 0
    let timer: NodeJS.Timeout | undefined
    const flush = (): void => {
      timer = undefined
      if (pending === '') return
      if (ws.bufferedAmount > BACKPRESSURE_BYTES) {
        timer = setTimeout(flush, BATCH_MS * 2)
        return
      }
      send({ t: 'out', data: pending, cursor: pendingCursor, replace: false })
      pending = ''
    }
    let subscription: ReturnType<WorkspacePtyRegistry['subscribe']>
    try {
      subscription = registry.subscribe(id, since, (event) => {
        if (event.kind === 'data') {
          pending += event.data
          pendingCursor = event.cursor
          if (pending.length > MAX_PENDING_CHARS) { ws.close(1013, 'too slow'); return }
          timer ??= setTimeout(flush, BATCH_MS)
          return
        }
        if (timer !== undefined) clearTimeout(timer)
        flush()
        send({ t: 'exit', exitCode: event.exitCode, error: event.error })
      })
    } catch {
      ws.close(4404, 'unknown session')
      return
    }
    const { replay } = subscription
    if (replay.replace || replay.data.length > 0) send({ t: 'out', data: replay.data, cursor: replay.cursor, replace: replay.replace })
    if (subscription.status !== 'running') send({ t: 'exit', exitCode: subscription.exitCode, error: subscription.error })

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return
      const message = parsePtyClientMessage(raw.toString('utf8'))
      if (message === null) { ws.close(1008, 'invalid message'); return }
      try {
        if (message.t === 'in') registry.write(id, message.data)
        else registry.resize(id, message.cols, message.rows)
      } catch {
        // The process already exited; the exit message has been or will be sent.
      }
    })
    let alive = true
    ws.on('pong', () => { alive = true })
    const ping = setInterval(() => {
      if (!alive) { ws.terminate(); return }
      alive = false
      ws.ping()
    }, PING_MS)
    ws.on('error', cause => { reportError('terminal stream', cause) })
    ws.on('close', () => {
      clearInterval(ping)
      if (timer !== undefined) clearTimeout(timer)
      subscription.dispose()
    })
  }

  return {
    handleUpgrade(req, socket, head) {
      if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) { refuse(socket, '403 Forbidden'); return }
      const params = new URL(req.url ?? '', 'http://127.0.0.1').searchParams
      const id = params.get('id')
      const sinceText = params.get('since') ?? '0'
      if (id === null || id.length === 0 || !/^\d{1,15}$/.test(sinceText)) { refuse(socket, '400 Bad Request'); return }
      wss.handleUpgrade(req, socket, head, (ws) => { attach(ws, id, Number(sinceText)) })
    },
    close() {
      for (const client of wss.clients) client.close(1001, 'going away')
      wss.close()
    },
  }
}
