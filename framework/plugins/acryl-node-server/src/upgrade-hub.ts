/**
 * WebSocket upgrades for the Cordis adapters (spec 047 T009): one hub per HTTP transport. It owns the `ws` server (text and size limits, no compression), runs the ported
 * `setupWebSocket` on whatever emits `upgrade` events (a `node:http` server, or the Host web server's exact-path upgrade routes), pings every socket and ends the ones that stop
 * answering, and gives each mounting plugin an `upgradeWebSocket` whose accepted sockets belong to that plugin: when it unloads they are closed with 1001 within the grace, and
 * what is left is terminated. The handler sees `close` exactly once.
 */
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type { UpgradeWebSocket } from 'acryl-router/helpers'
import type { FetchCallback } from './adapter/types.ts'
import { type UpgradeSource, setupWebSocket, upgradeWebSocket as portedUpgradeWebSocket } from './adapter/websocket.ts'
import type { WebSocketLike, WebSocketServerLike } from './adapter/websocket-types.ts'

export interface UpgradeHubOptions {
  /** The largest frame accepted, in bytes; a bigger one closes the socket with 1009. Default 1 MiB. */
  maxPayload?: number
  /** Milliseconds between pings; a peer that did not answer the previous one is terminated. Default 30 000; 0 turns the heartbeat off. */
  heartbeat?: number
  /** Milliseconds a closing socket gets to finish its close handshake before it is terminated. Default 2000. */
  grace?: number
}

type WebSocketServerConstructor = new (options: {
  noServer: true
  maxPayload: number
  perMessageDeflate: false
}) => WebSocketServerLike

/** The `ws` package, loaded when the first hub is made: an app that never upgrades does not need it. */
function loadWs(): WebSocketServerConstructor {
  try {
    return (createRequire(import.meta.url)('ws') as { WebSocketServer: WebSocketServerConstructor }).WebSocketServer
  } catch (error) {
    throw new Error(`WebSocket upgrades need the "ws" package (npm install ws): ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The part of the router a hub calls: run a request with connection facts and the adapter's bindings. */
export interface UpgradeRouter {
  fetch(request: Request, connection: { remoteAddress?: string | undefined; localPort?: number | undefined }, bindings?: object): Promise<Response>
}

/** What a hub needs of a Cordis context: tying a disposer to the plugin that asked. */
export interface Owner {
  effect(execute: () => () => unknown, label?: string): unknown
}

export class UpgradeHub {
  readonly server: WebSocketServerLike
  private readonly all = new Set<WebSocketLike>()
  private readonly alive = new WeakMap<WebSocketLike, boolean>()
  private readonly grace: number
  private timer: ReturnType<typeof setInterval> | undefined
  private closed = false

  constructor(options: UpgradeHubOptions = {}) {
    const Server = loadWs()
    this.server = new Server({ noServer: true, maxPayload: options.maxPayload ?? 1024 * 1024, perMessageDeflate: false })
    this.grace = options.grace ?? 2000
    this.server.on('connection', ws => {
      this.all.add(ws)
      this.alive.set(ws, true)
      ws.on('pong', () => this.alive.set(ws, true))
      ws.on('close', () => this.all.delete(ws))
    })
    const heartbeat = options.heartbeat ?? 30_000
    if (heartbeat > 0) {
      this.timer = setInterval(() => {
        for (const ws of this.all) {
          if (this.alive.get(ws) === false) {
            ws.terminate()
            continue
          }
          this.alive.set(ws, false)
          ws.ping()
        }
      }, heartbeat)
      this.timer.unref()
    }
  }

  /**
   * Accept upgrades from `source` and answer them with `router`: the request runs through the router's middleware with the socket's peer address and local port as connection
   * facts (so the same loopback, origin and host checks work), and the upgrade bindings travel in `c.env` for `upgradeWebSocket`.
   */
  attach(source: UpgradeSource, router: UpgradeRouter, options: { skipWhenRawUpgrade?: boolean } = {}): void {
    const fetchCallback: FetchCallback = (request, env) => {
      const { incoming } = env as { incoming: { socket: { remoteAddress?: string; localPort?: number } } }
      return router.fetch(request, { remoteAddress: incoming.socket.remoteAddress, localPort: incoming.socket.localPort }, env)
    }
    setupWebSocket({ server: source, fetchCallback, wss: this.server, ...options })
  }

  /** How many sockets are open. */
  get size(): number {
    return this.all.size
  }

  /** `upgradeWebSocket` for the plugin `owner`: the sockets it accepts are closed with 1001 when that plugin unloads. */
  upgradeWebSocketFor(owner: Owner): UpgradeWebSocket<WebSocketLike> {
    const mine = new Set<WebSocketLike>()
    owner.effect(() => () => this.closeAll(mine, 1001, 'going away'), 'upgrade sockets')
    const track = (ws: WebSocketLike): void => {
      mine.add(ws)
      ws.on('close', () => mine.delete(ws))
    }
    const owned = (...args: unknown[]): unknown => {
      const [first, second, third] = args as [unknown, Record<string, unknown> | undefined, Record<string, unknown> | undefined]
      return typeof first === 'function'
        ? (portedUpgradeWebSocket as (...a: unknown[]) => unknown)(first, { ...second, track })
        : (portedUpgradeWebSocket as (...a: unknown[]) => unknown)(first, second, { ...third, track })
    }
    return owned as UpgradeWebSocket<WebSocketLike>
  }

  /** Close `sockets` with `code`, wait for their close handshakes up to the grace, terminate what is left. */
  async closeAll(sockets: Iterable<WebSocketLike>, code: number, reason: string): Promise<void> {
    const open = [...sockets].filter(ws => ws.readyState < 3)
    await Promise.all(
      open.map(
        ws =>
          new Promise<void>(resolve => {
            const timer = setTimeout(() => {
              ws.terminate()
              resolve()
            }, this.grace)
            ws.on('close', () => {
              clearTimeout(timer)
              resolve()
            })
            if (ws.readyState === 1) ws.close(code, reason)
            else if (ws.readyState === 3) {
              clearTimeout(timer)
              resolve()
            }
          }),
      ),
    )
  }

  /** End everything: every socket closes with 1001, the heartbeat stops, the `ws` server closes. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.timer !== undefined) clearInterval(this.timer)
    await this.closeAll(this.all, 1001, 'going away')
    this.server.close()
  }
}

/** A stand-in for a server's `upgrade` events, for transports that dispatch upgrades themselves (the Host web server's exact-path routes). */
export class UpgradeEmitter extends EventEmitter {}
