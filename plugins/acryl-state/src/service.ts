/**
 * The ACRYL state service (`ctx.state`): observable cells owned by plugins. A cell created from a plugin's context is removed
 * when that plugin unloads, so a surface never keeps a value alive for a plugin that is gone. In process the cells are read
 * and subscribed to directly (the terminal UI); with a router present they are also readable as JSON and streamable as
 * server-sent events (Web and Desktop), read-only: only the Host plugin that owns a cell writes it.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { RouteContext } from 'acryl-router'
import { createCell, createDerived, type Cell, type ReadonlyCell } from './cell.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    state: State
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-state'

const KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/
const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

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
   * The current value of `key` as a server-sent event stream: the value now, then one event per change, until the request is
   * aborted, the client cancels, or the router is disposed. The stream registers itself with `waitUntil`, so the router
   * waits for it to end instead of treating the request as finished when the `Response` is returned.
   */
  stream(key: string, c: Pick<RouteContext, 'signal' | 'waitUntil'>): Response | undefined {
    const cell = this.find(key)
    if (cell === undefined) return undefined
    const { signal } = c
    const encoder = new TextEncoder()
    let stop: (() => void) | undefined
    let finish!: () => void
    c.waitUntil(new Promise<void>(resolve => { finish = resolve }))
    const body = new ReadableStream<Uint8Array>({
      start: controller => {
        const send = (value: unknown): void => {
          try { controller.enqueue(encoder.encode(`event: value\ndata: ${JSON.stringify(value)}\n\n`)) } catch { stop?.() }
        }
        send(cell.get())
        const unsubscribe = cell.subscribe(value => { send(value) })
        stop = () => {
          unsubscribe()
          signal.removeEventListener('abort', stop!)
          try { controller.close() } catch { /* already closed */ }
          finish()
        }
        if (signal.aborted) stop()
        else signal.addEventListener('abort', stop, { once: true })
      },
      cancel: () => { stop?.() },
    })
    return new Response(body, { headers: SSE_HEADERS })
  }
}

export function apply(ctx: Context): void {
  const state = new State(ctx)
  // The same cells on the router, read-only, for any surface; present only where a router is.
  ctx.inject(['router'], inner => {
    inner.router.get('/api/state', c => c.json({ keys: state.keys() }))
    inner.router.get('/api/state/:key', c => {
      const cell = state.find(c.params['key'] ?? '')
      return cell === undefined ? c.json({ error: 'no such state' }, 404) : c.json({ key: cell.key, value: cell.get() })
    })
    inner.router.get('/api/state/:key/events', c => state.stream(c.params['key'] ?? '', c) ?? c.json({ error: 'no such state' }, 404))
  })
}
