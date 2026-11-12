/**
 * The live terminal stream: one WebSocket per open terminal view, on the framework's router.
 *
 * Output goes down and keystrokes and size changes go up over one ordered connection, so nothing is
 * polled, nothing is re-sent, and two keystrokes can never arrive swapped. The route is an ordinary router
 * route: the own-page rule that guards the HTTP routes runs before the upgrade, with the exact `Origin` a
 * socket must show (a WebSocket is not covered by the same-origin policy on its own), and a refusal is a
 * plain status before any handshake. The framework's hub owns the sockets: it pings them, ends dead peers,
 * and closes them with 1001 when the plugin unloads.
 */

import { Acryl, type MiddlewareHandler } from 'acrylblends'
import type { UpgradeWebSocket, WSContext, WSEvents } from 'acrylblends/ws'
import { failure, ownPageSocket, type ReportError } from '../private-route.ts'
import { WORKSPACE_PTY_STREAM_PATH, parsePtyClientMessage, type PtyServerMessage } from './contract.ts'
import type { WorkspacePtyRegistry } from './service.ts'

/** Output is sent in batches this far apart, so a burst of small writes becomes one frame. */
const BATCH_MS = 4
/** When the socket already holds this much unsent data, wait instead of piling on. */
const BACKPRESSURE_BYTES = 1024 * 1024
/** A client this far behind is dropped; it reconnects and resumes from its cursor. */
const MAX_PENDING_CHARS = 8 * 1024 * 1024

/** A well-formed attach request: the session and the cursor its view already shows. */
const validAttach: MiddlewareHandler = async (c, next) => {
  const id = c.req.query('id')
  const since = c.req.query('since') ?? '0'
  if (id === undefined || id.length === 0 || !/^\d{1,15}$/.test(since)) return c.json(failure('invalid terminal stream request'), 400)
  await next()
}

/** One open view of session `id`, from cursor `since`: the replay, then live output; its input is written to the session. */
function attach(registry: WorkspacePtyRegistry, id: string, since: number): WSEvents {
  let subscription: ReturnType<WorkspacePtyRegistry['subscribe']> | undefined
  let pending = ''
  let pendingCursor = 0
  let timer: NodeJS.Timeout | undefined
  return {
    onOpen(_event, ws) {
      const send = (message: PtyServerMessage): void => {
        if (ws.readyState === 1) ws.send(JSON.stringify(message))
      }
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
    },
    onMessage(event, ws: WSContext) {
      if (subscription === undefined) return
      const message = typeof event.data === 'string' ? parsePtyClientMessage(event.data) : null
      if (message === null) { ws.close(1008, 'invalid message'); return }
      try {
        if (message.t === 'in') registry.write(id, message.data)
        else registry.resize(id, message.cols, message.rows)
      } catch {
        // The process already exited; the exit message has been or will be sent.
      }
    },
    onClose() {
      if (timer !== undefined) clearTimeout(timer)
      subscription?.dispose()
    },
  }
}

/**
 * GET {@link WORKSPACE_PTY_STREAM_PATH}`?id=&since=` upgraded to the session's stream. `upgrade` is the mounting plugin's
 * `ctx.routerHttp.upgrades()`, so the sockets belong to it; the path must be one the plugin mounted with `upgrade: [path]`.
 */
export function ptyStreamRoutes(registry: WorkspacePtyRegistry, upgrade: UpgradeWebSocket, reportError: ReportError): Acryl {
  return new Acryl().get(
    WORKSPACE_PTY_STREAM_PATH,
    ownPageSocket,
    validAttach,
    upgrade((c) => {
      const events = attach(registry, c.req.query('id') ?? '', Number(c.req.query('since') ?? '0'))
      return { ...events, onError: (event) => { reportError('terminal stream', event instanceof ErrorEvent ? event.error : event) } }
    }, { textOnly: true, onError: (cause: unknown) => { reportError('terminal stream', cause) } }),
  )
}
