/**
 * The framework's standalone HTTP adapter (spec 046, ported in spec 047), the standalone counterpart of the Host adapter. It owns one
 * `node:http` server built by the ported adapter in `src/adapter/` and hands every request to `ctx.router.fetch`, with the socket's peer
 * address and local port as connection facts.
 * Use it in an app that runs without the ACRYL Host; inside the Host, `acryl-router-http` mounts prefixes on the Host's own web server.
 * One adapter per runtime: a plugin keeps asking `ctx.inject(['routerHttp'], ...)` for a mount, which simply never fires here, because this
 * adapter serves the whole router.
 *
 * A configured port that is taken is followed by the next free one, at most `scan` further ports; port 0 lets the system choose. A port a
 * browser refuses to open (`RESTRICTED_PORTS`) is skipped like a taken one. Disposal ends open streams, closes every connection and returns
 * once the port is free.
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionInfo, Router } from '../../acryl-router/src/index.ts'
import { Request as AdapterRequest } from './adapter/request.ts'
import { RAW_RESPONSE_HANDLED, RAW_UPGRADE_HANDLED, type RawUpgradeRequest } from './adapter/raw.ts'
import { createAdaptorServer } from './adapter/server.ts'
import { UpgradeHub, type UpgradeHubOptions } from './upgrade-hub.ts'
import type { UpgradeWebSocket } from '../../acryl-router/src/helpers/index.ts'
import type { WebSocketLike } from './adapter/websocket-types.ts'

export { serveStatic, type ServeStaticOptions } from './adapter/serve-static.ts'
export { RequestError } from './adapter/request.ts'
export { testWebSocket, type TestSocket, type TestWebSocketOptions, type TestWebSocketResult } from './test-websocket.ts'
export { UpgradeEmitter, UpgradeHub, type UpgradeHubOptions, type UpgradeRouter } from './upgrade-hub.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-node-server'
export const inject = ['router']

/** A raw node handler: the request and response are the platform's, and the adapter writes nothing for them. */
export interface RawRoute {
  readonly kind: 'prefix' | 'exact'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** A raw upgrade handler: the socket is the handler's once the path matches; the router never sees the upgrade. */
export interface RawUpgradeRoute {
  readonly path: string
  readonly handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

/**
 * Answer a request before raw routes and the router, or pass it on with `undefined`. The callback runs synchronously, so a request no gate answers still
 * reaches a raw route's sentinel synchronously; a gate that needs the router (a host keeping an app's URLs in scope under a prefix, the ACRYL frame's canvas)
 * returns its promise, and the adapter handles that like the router's own answer. `connection` carries the socket facts, which a router mount needs to check
 * the peer and the real port.
 */
export type RequestGate = (request: Request, connection: ConnectionInfo) => Response | Promise<Response> | undefined

/** The pathname of a request target, for raw matching: a malformed one matches nothing (`'/'` matches only itself). */
function pathnameOf(target: string | undefined): string {
  if (target === undefined) return '/'
  try {
    return new URL(target, 'http://node-server.invalid').pathname
  } catch {
    return '/'
  }
}

export interface Config {
  hostname: string
  port: number
  scan: number
  /** Limits of WebSocket upgrades (`upgrades()`); the defaults suit most apps. */
  websocket: UpgradeHubOptions
}

/** Every field has a default, so a caller passes only what it changes: `ctx.plugin(plugin, { ... })` takes the partial shape. */
export const Config: z<Partial<Config>, Config> = z.object({
  hostname: z.string().default('127.0.0.1').description('Address to bind. Loopback by default; binding elsewhere exposes the app to the network.'),
  port: z.number().min(0).max(65535).default(0).description('Port to listen on; 0 lets the system choose. A taken port, or one a browser refuses, is followed by the next usable one.'),
  scan: z.number().min(0).default(20).description('How many further ports to try when the configured one is taken or a browser refuses it.'),
  websocket: z
    .object({
      maxPayload: z.number().min(1).default(1024 * 1024).description('The largest WebSocket frame accepted, in bytes; a bigger one closes the socket with 1009.'),
      heartbeat: z.number().min(0).default(30_000).description('Milliseconds between pings; a peer that did not answer the last one is terminated. 0 turns it off.'),
      grace: z.number().min(0).default(2000).description('Milliseconds a closing socket gets before it is terminated when its plugin unloads.'),
    })
    .default({}),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    nodeServer: NodeServer
  }
}

/**
 * Milliseconds a request already in flight, or an upgraded socket's own owner, may finish once the server stops taking new work. A save during a
 * restart must not be cut; a stream that never ends must not hold the stop open.
 */
export const STOP_GRACE_MS = 2_000

export class NodeServer extends Service {
  readonly hostname: string
  readonly config: Config
  private readonly server: Server
  private readonly router: Router
  private hub: UpgradeHub | undefined
  private bound = 0
  /** The one stop this server runs: a second call (the disposer after an explicit stop) waits on the same promise. */
  private stopping: Promise<void> | undefined
  /** Requests whose response has not finished yet: the stop waits for them before their sockets are cut. */
  private active = 0
  /** Upgraded sockets this server handed out (WebSockets): neither close() nor closeAllConnections() reaches them, so the stop tracks them itself. */
  private readonly upgraded = new Set<Duplex>()
  /** Raw routes registered by the host's compatibility layer (see {@link registerRaw}). */
  private readonly rawExact = new Map<string, RawRoute['handler']>()
  private readonly rawPrefix = new Map<string, RawRoute['handler']>()
  private readonly rawUpgrades = new Map<string, RawUpgradeRoute['handler']>()
  /** Gates registered by a host that maps an app's URLs (see {@link NodeServer.gate}); they run in the order they were added. */
  private readonly gates: RequestGate[] = []
  /** One raw dispatch per upgrade request: a second listener (or a re-added one) must never emit the same request again. */
  private readonly rawUpgradeSeen = new WeakSet<IncomingMessage>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'nodeServer')
    this.config = config
    this.hostname = config.hostname
    const router = ctx.router
    this.router = router
    // The handler sees the router's bindings (`c.env.connection`), not the raw `incoming`/`outgoing` pair. The global `Request` and
    // `Response` stay the platform's, because this adapter shares its process with the rest of the app; so the adapter's lightweight
    // request is made a real one (its signal still aborts when the client goes away) before the router re-creates it with its own signal.
    this.server = createAdaptorServer({
      fetch: (request, bindings) => {
        const { incoming, outgoing } = bindings as { incoming: IncomingMessage; outgoing: ServerResponse }
        // One count of a request whose response has not finished: the stop (see the disposer below) lets these finish before their sockets are cut,
        // which is what keeps a save made while the app restarts from being lost.
        this.active += 1
        let finished = false
        const settle = (): void => {
          if (finished) return
          finished = true
          this.active -= 1
        }
        outgoing.once('finish', settle)
        outgoing.once('close', settle)
        // A raw route owns the node response: start it and return the sentinel synchronously, so the adapter (which checks the
        // sentinel before treating the result as a promise) writes nothing. The handler's own failure becomes a 500 here.
        // An upgrade that reaches the HTTP fetch path has no WebSocket listener to claim it (a provider transition, or no hub at all): refuse it
        // here, before any HTTP route (a raw prefix would otherwise answer it as a normal request), so it is never answered twice.
        if (incoming.headers.upgrade !== undefined) {
          const websocket = incoming.headers.upgrade.toLowerCase() === 'websocket'
          return new Response('', {
            status: websocket ? 503 : 400,
            headers: { connection: 'close' },
          })
        }
        // A gate decides before raw routes and the router (a host that keeps an app's URLs under a prefix answers a navigation the frame's root would
        // otherwise claim, and sends the app's own sub-resources to the router so a raw prefix cannot answer for the app): its answer is the request's.
        if (this.gates.length > 0) {
          const requestLike = request as unknown as Request
          const connection: ConnectionInfo = { remoteAddress: incoming.socket.remoteAddress, localPort: incoming.socket.localPort }
          for (const gate of this.gates) {
            const answer = gate(requestLike, connection)
            if (answer !== undefined) return answer
          }
        }
        const raw = this.rawFor(incoming)
        if (raw !== undefined) {
          void (async () => {
            try {
              await raw(incoming, outgoing)
            } catch {
              if (!outgoing.headersSent) {
                outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
                outgoing.end('internal error')
              } else outgoing.destroy()
            }
          })()
          return RAW_RESPONSE_HANDLED
        }
        return router.fetch(new AdapterRequest(request), { remoteAddress: incoming.socket.remoteAddress, localPort: incoming.socket.localPort })
      },
      hostname: config.hostname,
      overrideGlobalObjects: false,
    }) as Server
    // ONE raw upgrade listener for the server's lifetime, ahead of the router's WebSocket setups. It consults the registry, so a claim added or
    // removed never adds or removes a listener; a request it dispatched once is never dispatched again (a guard beside the single ownership).
    this.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (this.rawUpgradeSeen.has(request)) return
      // Upgraded sockets leave the HTTP connection lifecycle: close() and closeAllConnections() never reach them (measured, not assumed), so the stop
      // tracks them and waits for their owner's close frame before cutting what is left.
      this.upgraded.add(socket)
      socket.once('close', () => { this.upgraded.delete(socket) })
      // Node drops the HTTP server's own error listener when it hands a socket to 'upgrade', and the route may still be deciding (a check that
      // reads a store) when the client resets: without a listener of its own, that ECONNRESET would throw and stop the whole server. The socket
      // is simply gone; its owner, if it has one yet, sees the close.
      socket.on('error', () => { socket.destroy() })
      const websocket = request.headers.upgrade?.toLowerCase() === 'websocket'
      const handler = this.rawUpgrades.get(pathnameOf(request.url))
      // A raw claim owns its path. A WebSocket upgrade nobody claimed is left to the router's hub when one is attached; with no hub, or for a
      // protocol this server does not speak, the refusal is written here, cleanly, and never by a second handler.
      if (handler === undefined) {
        if (!websocket || this.hub !== undefined) return
        if (socket.destroyed || socket.writableEnded) return
        ;(request as RawUpgradeRequest)[RAW_UPGRADE_HANDLED] = true
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      if (!websocket) {
        if (socket.destroyed || socket.writableEnded) return
        ;(request as RawUpgradeRequest)[RAW_UPGRADE_HANDLED] = true
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      this.rawUpgradeSeen.add(request)
      ;(request as RawUpgradeRequest)[RAW_UPGRADE_HANDLED] = true
      Promise.resolve(handler(request, socket, head)).catch(() => socket.destroy())
    })
    ctx.effect(() => () => this.stop(), 'acryl-node-server: close listener and open connections')
  }

  /**
   * Stop serving, gracefully, and resolve once the port is free: no new connections; requests already in flight may finish (a stream that never ends is
   * cut) within {@link STOP_GRACE_MS}; each upgraded socket's owner closes it with a close frame first, and what is left is destroyed. Idempotent - the
   * disposer calls it.
   *
   * Calling this BEFORE the rest of the app is disposed is what makes the grace count: the router has its own disposal, and it aborts in-flight requests
   * and ends their bodies by design, concurrently with every other disposer (Cordis runs them together). A launcher that disposes the context directly
   * therefore cuts the request this drains; a launcher that stops the server first lets it answer, then disposes.
   */
  stop(): Promise<void> {
    this.stopping ??= this.closeGracefully()
    return this.stopping
  }

  private async closeGracefully(): Promise<void> {
    // The hub's close runs beside the request grace rather than before it: the stop takes one grace, not two.
    const upgrades = this.hub?.close()
    if (!this.server.listening) {
      await upgrades
      return
    }
    const stopped = new Promise<void>(resolve => { this.server.close(() => { resolve() }) })
    this.server.closeIdleConnections()
    const settled = await this.settleStop(STOP_GRACE_MS)
    // A response that finished exactly at the grace's end is written but not yet delivered: end its socket gracefully (a FIN behind the buffered body)
    // instead of destroying it, which would answer the client with a reset and an empty body. A little flush window, then force what is left.
    this.server.closeIdleConnections()
    const drained = settled
      ? await Promise.race([
          stopped.then(() => true),
          new Promise<boolean>(resolve => { setTimeout(() => { resolve(false) }, 300) }),
        ])
      : false
    if (!drained) {
      this.server.closeAllConnections()
      // Upgraded sockets that outlived their owner's close: destroy them, or the server's own close never finishes.
      for (const socket of this.upgraded) socket.destroy()
      this.upgraded.clear()
    }
    await Promise.all([upgrades, stopped])
  }

  /**
   * Wait, bounded, until no request is in flight and no upgraded socket is left; true when both reached zero inside the bound. Every pass sweeps idle
   * keep-alive sockets again: the single sweep `close()` does misses one that becomes idle after its request finished, and such a socket would otherwise
   * hold the stop to its deadline.
   */
  private async settleStop(ms: number): Promise<boolean> {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (this.active === 0 && this.upgraded.size === 0) return true
      this.server.closeIdleConnections()
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    return this.active === 0 && this.upgraded.size === 0
  }

  /**
   * Serve a raw node handler at `path`, beside the router: `exact` matches the pathname only, `prefix` the path and everything below it. The
   * handler gets the platform's `IncomingMessage`/`ServerResponse` and owns the response; the router is not run for it. A path already served
   * throws. The returned remover restores the path (the server itself goes on serving the rest).
   */
  registerRaw(route: RawRoute): () => void {
    const table = route.kind === 'exact' ? this.rawExact : this.rawPrefix
    if (table.has(route.path)) throw new Error(`acryl-node-server: ${route.path} is already served`)
    table.set(route.path, route.handler)
    return () => {
      if (table.get(route.path) === route.handler) table.delete(route.path)
    }
  }

  /**
   * Answer matching requests before raw routes and the router, so a host can keep an app's URLs in scope under a prefix (the frame's canvas). A gate runs
   * synchronously and can answer with a promise (see {@link RequestGate}); gates run in the order they were added, and the returned remover takes this one back.
   */
  gate(handler: RequestGate): () => void {
    this.gates.push(handler)
    return () => {
      const at = this.gates.indexOf(handler)
      if (at !== -1) this.gates.splice(at, 1)
    }
  }

  /**
   * A gate's asynchronous answer: run the request it was given through the router, in the adapter's request form (a gate never makes one itself), with the
   * socket facts. The raw routes do not run for that request.
   */
  throughRouter(request: Request, connection: ConnectionInfo = {}): Promise<Response> {
    return this.router.fetch(new AdapterRequest(request), connection)
  }

  /**
   * Claim an upgrade path for a raw node handler: the handler receives `(req, socket, head)` and from then on owns the socket. The router's
   * WebSocket handling never sees a claimed upgrade. A path already claimed throws; the remover releases the claim. The transport's one raw
   * listener exists for the server's whole lifetime and consults this registry, so claims coming and going never add or remove a listener.
   */
  registerRawUpgrade(route: RawUpgradeRoute): () => void {
    if (this.rawUpgrades.has(route.path))
      throw new Error(`acryl-node-server: the upgrade path ${route.path} is already claimed`)
    this.rawUpgrades.set(route.path, route.handler)
    return () => {
      if (this.rawUpgrades.get(route.path) !== route.handler) return
      this.rawUpgrades.delete(route.path)
    }
  }

  /** The raw handler for a request: an exact path first, then the longest matching prefix. */
  private rawFor(incoming: IncomingMessage): RawRoute['handler'] | undefined {
    const path = pathnameOf(incoming.url)
    const exact = this.rawExact.get(path)
    if (exact !== undefined) return exact
    let best: { length: number; handler: RawRoute['handler'] } | undefined
    for (const [prefix, handler] of this.rawPrefix)
      if ((path === prefix || path.startsWith(`${prefix}/`)) && (best === undefined || prefix.length > best.length))
        best = { length: prefix.length, handler }
    return best?.handler
  }

  /**
   * `upgradeWebSocket` for the plugin that asks (call it once, in `apply`): `app.get('/ws', upgrade((c) => ({ onMessage(event, ws) { ... } })))`. Checks go in ordinary middleware on the
   * route, and a handler that returns a `Response` refuses the upgrade with that status before any handshake. Every socket it accepts belongs to the calling plugin: when the plugin
   * unloads they are closed with 1001 within `websocket.grace` and the handler sees `close` once. Pass `{ textOnly: true }` to drop binary frames. Needs the `ws` package.
   */
  upgrades(): UpgradeWebSocket<WebSocketLike> {
    if (!this.hub) {
      this.hub = new UpgradeHub(this.config.websocket)
      this.hub.attach(this.server, this.ctx.router, { skipWhenRawUpgrade: true })
    }
    return this.hub.upgradeWebSocketFor(this.ctx)
  }

  /** How many `upgrade` listeners the transport holds (raw plus router setups); a test asserts it does not grow across claim changes. */
  get upgradeListenerCount(): number {
    return this.server.listenerCount('upgrade')
  }

  /** How many WebSocket connections are open now. */
  get sockets(): number {
    return this.hub?.size ?? 0
  }

  /** The port in use, 0 before the server listens. */
  get port(): number {
    return this.bound
  }

  /** The address clients use. */
  get url(): string {
    return `http://${this.hostname.includes(':') ? `[${this.hostname}]` : this.hostname}:${String(this.bound)}`
  }

  /** Bind, scanning past taken ports and past the ports a browser refuses. */
  async listen(): Promise<void> {
    const { port, scan, hostname } = this.config
    const last = port === 0 ? 0 : Math.min(65_535, port + scan)
    for (const candidate of portCandidates(port, scan)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => { reject(error) }
          this.server.once('error', onError)
          this.server.listen(candidate, hostname, () => { this.server.off('error', onError); resolve() })
        })
        this.bound = (this.server.address() as AddressInfo).port
        return
      } catch (error) {
        if (!isPortUnavailable(error)) throw error
      }
    }
    throw new Error(`acryl-node-server: no usable port from ${String(port)} to ${String(last)} on ${hostname}: each is taken, or one a browser refuses`)
  }
}

/**
 * The ports every Fetch client refuses to connect to: the Fetch standard's bad ports (https://fetch.spec.whatwg.org/#port-blocking). Chromium
 * refuses a page on one (ERR_UNSAFE_PORT) and Node's fetch answers "bad port"; the list below is the one Node 24 reports, probed port by port
 * on 2026-11-03 (82 ports, 1 to 10080). An app's stable port is hashed into 3100..3999, and 3659 is on the list: without this rule one app in
 * 900 would come up on an address no browser may open, which the frame gate caught that day (verify-frame-token was refused at 3659).
 */
export const RESTRICTED_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104,
  109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
])

/** Whether a browser refuses to open this port. */
export function isRestrictedPort(port: number): boolean {
  return RESTRICTED_PORTS.has(port)
}

/**
 * The ports `listen` may try, in order: `port` with at most `scan` further ones, without the ports a browser refuses. Port 0 stays alone: the
 * system chooses it, and the ports it hands out are above the restricted range.
 */
export function portCandidates(port: number, scan: number): number[] {
  const last = port === 0 ? 0 : Math.min(65_535, port + scan)
  const candidates: number[] = []
  for (let candidate = port; candidate <= last; candidate += 1) {
    if (!isRestrictedPort(candidate)) candidates.push(candidate)
  }
  return candidates
}

/**
 * Whether a failed bind means "this port, try the next one". A port another socket holds answers `EADDRINUSE` everywhere. On Windows a port
 * inside a range the system reserves (Hyper-V, WSL and Docker exclude ranges, `netsh interface ipv4 show excludedportrange`) answers
 * `EACCES`, which is a property of that port too; elsewhere `EACCES` means the process may not bind low ports at all, so moving on would
 * only hide the reason.
 */
export function isPortUnavailable(error: unknown, platform: NodeJS.Platform = process.platform): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EADDRINUSE' || (platform === 'win32' && code === 'EACCES')
}

/** Loads once the server listens, so a plugin that injects `nodeServer` can rely on `url`. A failure to bind fails the plugin. */
export async function apply(ctx: Context, config: Partial<Config> = {}): Promise<void> {
  const server = new NodeServer(ctx, { hostname: '127.0.0.1', port: 0, scan: 20, websocket: {}, ...config })
  await server.listen()
}
