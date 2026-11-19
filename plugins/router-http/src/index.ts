/**
 * The Web adapter for `acryl-router` (spec 046, milestone M2). A plugin that owns routes on the router asks for a path
 * prefix to be served over HTTP: `ctx.routerHttp.mount('/api/market')` claims that prefix on the DSH `webServer` and every
 * request under it is run through `router.fetch`. The TUI and Desktop do not need this: they call `router.fetch` directly.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { RouterHttpService } from 'acryl-router'
import type { UpgradeWebSocket } from 'acryl-router/helpers'
import { Context, Service } from '@deepseek-ai/cordis'
import { UpgradeEmitter, UpgradeHub } from 'acryl-node-server'
import { serve } from './serve.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-router-http'

/** Hard requirements: both services must exist, otherwise this plugin stays PENDING. */
export const inject = ['router', 'webServer']

/**
 * The slice of the DSH `webServer` this adapter uses, as its own port: a prefix claim that returns its remover. The service
 * is read by name, so this package imports nothing from the DeepSeek Harness (the layout gate keeps that count falling).
 */
export interface WebServerPort {
  register(route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
  /** One exact-path upgrade claim (`WebUpgradeRoute` of the web server); optional because an older web server has none. */
  registerUpgrade?(route: {
    readonly path: string
    readonly handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
  }): () => void
}

const PREFIX_PATTERN = /^\/[A-Za-z0-9._~\-/]*[A-Za-z0-9._~-]$/

export class RouterHttp extends Service implements RouterHttpService {
  private readonly router: Context['router']
  private readonly web: WebServerPort
  private hub: UpgradeHub | undefined
  /** One upgrade helper per calling context: a fresh wrapper per call made every service event look like an owner change. */
  private readonly upgradeHelpers = new WeakMap<object, UpgradeWebSocket>()
  /** A stable identity for this service instance's hub: a caller that must recognize the same owner across calls keys on this, not on a helper. */
  private readonly hubIdentity: object = {}
  /** The adapter's own context: the hub lives as long as the adapter, whichever plugin asked for it first (`this.ctx` is the caller's). */
  private readonly home: Context
  private readonly upgradesIn = new UpgradeEmitter()

  constructor(ctx: Context) {
    super(ctx, 'routerHttp')
    this.home = ctx
    this.router = ctx.router
    this.web = ctx.get('webServer') as WebServerPort
  }

  /**
   * Serve `prefix` and everything below it through the router. Returns a remover; the mount also goes away when the
   * calling plugin unloads. A prefix another route already claims throws, as the webServer treats it as misconfiguration.
   * `options.upgrade` names the exact paths that may be upgraded to a WebSocket: each must be inside the prefix, and each is one
   * exact-path upgrade route of the web server, removed with the mount. No other path of the mount accepts an upgrade.
   */
  mount(prefix: string, options: { readonly upgrade?: readonly string[] } = {}): () => void {
    if (!PREFIX_PATTERN.test(prefix)) throw new TypeError(`acryl-router-http: "${prefix}" is not a mountable path prefix`)
    const upgrade = options.upgrade ?? []
    for (const path of upgrade) {
      if (!PREFIX_PATTERN.test(path) || !(path === prefix || path.startsWith(`${prefix}/`)))
        throw new TypeError(`acryl-router-http: the upgrade path "${path}" is not inside the prefix "${prefix}"`)
    }
    if (upgrade.length > 0 && this.web.registerUpgrade === undefined)
      throw new TypeError('acryl-router-http: this web server cannot take WebSocket upgrades (it has no registerUpgrade)')
    const removers: Array<() => void> = []
    // Claim the upgrade paths first: a duplicate throws before anything is mounted, so a refused mount leaves nothing behind.
    try {
      if (upgrade.length > 0) this.ensureHub()
      for (const path of upgrade) {
        removers.push(
          (this.web.registerUpgrade as NonNullable<WebServerPort['registerUpgrade']>)({
            path,
            handler: (req, socket, head) => { this.upgradesIn.emit('upgrade', req, socket, head) },
          }),
        )
      }
      removers.push(
        this.web.register({
          kind: 'prefix',
          path: prefix,
          handler: (req, res) => serve(this.router, req, res),
        }),
      )
    } catch (error) {
      for (const remove of removers) remove()
      throw error
    }
    const remove = (): void => { for (const undo of removers.splice(0)) undo() }
    this.ctx.effect(() => () => { remove() }, `acryl-router-http: mount ${prefix}`)
    return remove
  }

  /**
   * `upgradeWebSocket` for the calling plugin: the sockets its routes accept are closed with 1001 when it unloads. Needs the `ws` package.
   * The route must be on a path the plugin mounted with `upgrade: [path]`.
   */
  /** Stable for this service's lifetime; a re-provided adapter has a new one, which is how a caller sees a new owner. */
  hubToken(): object {
    return this.hubIdentity
  }

  upgrades(): UpgradeWebSocket {
    const owner = this.ctx
    const cached = this.upgradeHelpers.get(owner)
    if (cached !== undefined) return cached
    const created = this.ensureHub().upgradeWebSocketFor(owner) as unknown as UpgradeWebSocket
    this.upgradeHelpers.set(owner, created)
    return created
  }

  /** How many WebSocket connections are open now. */
  get sockets(): number {
    return this.hub?.size ?? 0
  }

  private ensureHub(): UpgradeHub {
    if (!this.hub) {
      const hub = new UpgradeHub()
      hub.attach(this.upgradesIn, this.router)
      this.hub = hub
      this.home.effect(() => () => hub.close(), 'acryl-router-http: WebSocket hub')
    }
    return this.hub
  }
}

export function apply(ctx: Context): void {
  new RouterHttp(ctx)
}

export { serve, type FetchRouter } from './serve.ts'
export { sendResponse, toRequest } from './bridge.ts'
