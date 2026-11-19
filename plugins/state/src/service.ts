/**
 * The ACRYL state service (`ctx.state`): observable cells owned by plugins. A cell created from a plugin's context is removed
 * when that plugin unloads, so a surface never keeps a value alive for a plugin that is gone. In process the cells are read
 * and subscribed to directly (the terminal UI); with a router present they are also readable as JSON and streamable as
 * server-sent events (Web and Desktop), read-only: only the Host plugin that owns a cell writes it.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { Acryl, type Context as RequestContext, type MiddlewareHandler } from 'acryl-router'
import { streamSSE, type UpgradeWebSocket } from 'acryl-router/helpers'
import { loopbackOnly, methodNotAllowed } from 'acryl-router/middleware'
import { createCell, createDerived, type Cell, type ReadonlyCell } from './cell.ts'
import { CLIENT_SOURCE } from './client-source.ts'
import { refuseStranger, stateSocket } from './socket.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    state: State
  }
}

const KEEP_ALIVE_MS = 15_000

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-state'

const KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/

/** Names under `/api/state` that are routes, not keys: a cell cannot be called by one. */
const RESERVED_KEYS = new Set(['ws', 'client.js'])

export class State extends Service {
  private readonly cells = new Map<string, ReadonlyCell<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'state')
  }

  private claim(key: string): void {
    if (!KEY_PATTERN.test(key)) throw new TypeError(`acryl-state: key "${key}" must be dotted lowercase words, like "market.sources"`)
    if (RESERVED_KEYS.has(key)) throw new TypeError(`acryl-state: "${key}" is the name of a route under /api/state, choose another key`)
    if (this.cells.has(key)) throw new Error(`acryl-state: key "${key}" is already in use`)
  }

  private report = (error: unknown): void => {
    this.ctx.logger.error(`acryl-state: a subscriber failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  /** Create a writable cell owned by the calling plugin. The key must be new. */
  cell<T>(key: string, initial: T): Cell<T> {
    this.claim(key)
    const cell = createCell(key, initial, this.report)
    this.cells.set(key, cell as ReadonlyCell<unknown>)
    this.ctx.effect(() => () => { this.cells.delete(key) }, `acryl-state: cell ${key}`)
    return cell
  }

  /** Create a read-only cell computed from other cells, owned by the calling plugin. */
  derive<D extends readonly ReadonlyCell<unknown>[], T>(
    key: string,
    inputs: D,
    compute: (...values: { [K in keyof D]: D[K] extends ReadonlyCell<infer V> ? V : never }) => T,
  ): ReadonlyCell<T> {
    this.claim(key)
    const derived = createDerived(key, inputs, compute, this.report)
    this.cells.set(key, derived.cell as ReadonlyCell<unknown>)
    this.ctx.effect(() => () => { derived.dispose(); this.cells.delete(key) }, `acryl-state: derived ${key}`)
    return derived.cell
  }

  /** A cell by key, if one is live. */
  find<T = unknown>(key: string): ReadonlyCell<T> | undefined {
    return this.cells.get(key) as ReadonlyCell<T> | undefined
  }

  keys(): string[] {
    return [...this.cells.keys()].sort()
  }

  /**
   * The current value of `key` as a server-sent event stream: the value now, then one event per change, until the client cancels or the router
   * is disposed (both abort the stream). A comment line goes out every 15 seconds so proxies and browsers keep an idle stream open. A string value travels as it is; with `json`
   * (the `?json=1` of the browser client) every value is JSON, so `"12"` and `12` can be told apart.
   */
  stream(key: string, c: RequestContext, json = false): Response | undefined {
    const cell = this.find(key)
    if (cell === undefined) return undefined
    return streamSSE(c, async stream => {
      const ended = new Promise<void>(resolve => { stream.onAbort(resolve) })
      // Writes are asynchronous; chaining them keeps events in the order the cell changed.
      let queue: Promise<unknown> = Promise.resolve()
      const send = (value: unknown): void => {
        queue = queue.then(() => stream.writeSSE({ event: 'value', data: typeof value === 'string' && !json ? value : JSON.stringify(value) })).catch(() => {})
      }
      send(cell.get())
      const unsubscribe = cell.subscribe(send)
      const keepAlive = setInterval(() => { queue = queue.then(() => stream.write(': keepalive\n\n')).catch(() => {}) }, KEEP_ALIVE_MS)
      keepAlive.unref()
      try {
        await ended
      } finally {
        clearInterval(keepAlive)
        unsubscribe()
      }
    })
  }
}

export function apply(ctx: Context): void {
  const state = new State(ctx)
  // The same cells on the router, read-only, for any surface; present only where a router is. A request over a socket must come from this machine to this
  // app; the terminal calls the router in process and is the host's own code.
  ctx.inject(['router'], inner => {
    const api = new Acryl()
    // The WebSocket form is mounted when a server that upgrades appears (the server row comes after this one in a blend); until then, and without the `ws` package, `/ws` answers 404 and the
    // browser client follows the event streams. The route is registered before `/:key`, which would otherwise take `ws` for a key.
    let socket: MiddlewareHandler | undefined
    api.use(loopbackOnly({ inProcess: 'allow' }), methodNotAllowed({ app: api }))
      .get('/', c => c.json({ keys: state.keys() }))
      .get('/client.js', c => c.body(CLIENT_SOURCE, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }))
      .get('/ws', async (c, next) => {
        const upgrade = socket
        if (upgrade === undefined) return c.json({ error: 'this server does not upgrade to a WebSocket' }, 404)
        const refusal = refuseStranger(c)
        if (refusal !== undefined) return refusal
        return await upgrade(c, next)
      })
      .get('/:key', c => {
        const cell = state.find(c.req.param('key'))
        return cell === undefined ? c.json({ error: 'no such state' }, 404) : c.json({ key: cell.key, value: cell.get() })
      })
      .get('/:key/events', c => state.stream(c.req.param('key'), c, c.req.query('json') === '1') ?? c.json({ error: 'no such state' }, 404))
    inner.router.route('/api/state', api)
    inner.inject(['nodeServer'], withServer => {
      try {
        const upgrade = (withServer as unknown as { nodeServer: { upgrades(): UpgradeWebSocket } }).nodeServer.upgrades()
        socket = stateSocket(state, { upgrade })
        withServer.effect(() => () => { socket = undefined }, 'acryl-state: the WebSocket route')
      } catch (cause) {
        ctx.logger.warn(`acryl-state: state is followed by event streams only (${cause instanceof Error ? cause.message : String(cause)})`)
      }
    })
    // Over HTTP only where an adapter exists (Web and Desktop); the terminal needs none.
    inner.inject(['routerHttp'], http => { http.routerHttp.mount('/api/state') })
  })
}
