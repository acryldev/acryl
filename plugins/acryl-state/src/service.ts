/**
 * The ACRYL state service (`ctx.state`): observable cells owned by plugins. A cell created from a plugin's context is removed
 * when that plugin unloads, so a surface never keeps a value alive for a plugin that is gone. In process the cells are read
 * and subscribed to directly (the terminal UI); with a router present they are also readable as JSON and streamable as
 * server-sent events (Web and Desktop), read-only: only the Host plugin that owns a cell writes it.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { RouteContext } from 'acryl-router'
import { streamSSE } from 'acryl-router/helpers'
import { loopbackOnly } from 'acryl-router/middleware'
import { createCell, createDerived, type Cell, type ReadonlyCell } from './cell.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    state: State
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-state'

const KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/

export class State extends Service {
  private readonly cells = new Map<string, ReadonlyCell<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'state')
  }

  private claim(key: string): void {
    if (!KEY_PATTERN.test(key)) throw new TypeError(`acryl-state: key "${key}" must be dotted lowercase words, like "market.sources"`)
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
   * The current value of `key` as a server-sent event stream: the value now, then one event per change, until the request is aborted, the client
   * cancels, or the router is disposed. `streamSSE` holds the request in flight until then, so the router waits for the stream.
   */
  stream(key: string, c: RouteContext): Response | undefined {
    const cell = this.find(key)
    if (cell === undefined) return undefined
    return streamSSE(c, stream => {
      stream.send(cell.get(), { event: 'value' })
      return cell.subscribe(value => { stream.send(value, { event: 'value' }) })
    })
  }
}

export function apply(ctx: Context): void {
  const state = new State(ctx)
  // The same cells on the router, read-only, for any surface; present only where a router is. A request over a socket must come from this machine to this
  // app; the terminal calls the router in process and is the host's own code.
  ctx.inject(['router'], inner => {
    const api = inner.router.group('/api/state', loopbackOnly({ inProcess: 'allow' }))
    api.get('/', c => c.json({ keys: state.keys() }))
    api.get('/:key', c => {
      const cell = state.find(c.param('key') ?? '')
      return cell === undefined ? c.json({ error: 'no such state' }, 404) : c.json({ key: cell.key, value: cell.get() })
    })
    api.get('/:key/events', c => state.stream(c.param('key') ?? '', c) ?? c.json({ error: 'no such state' }, 404))
    // Over HTTP only where an adapter exists (Web and Desktop); the terminal needs none.
    inner.inject(['routerHttp'], http => { http.routerHttp.mount('/api/state') })
  })
}
