/**
 * The ACRYL router service (`ctx.router`): plugin-owned routes and middleware on Web-standard Request and Response.
 *
 * A route is registered from the owning plugin's context, so it disappears when that plugin unloads. `fetch(request)`
 * runs a request in process: Web serves it behind HTTP (see spec 046, milestone M2), Desktop and the terminal UI call it
 * directly, so one handler serves every surface without opening a socket. Disposal aborts in-flight requests through their
 * `signal` and waits for them to settle.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { RouteTable } from './table.ts'
import type { ConnectionInfo, Handler, Middleware, RouteMethod, TrailingSlash } from './types.ts'

const DEFAULT_DISPOSE_GRACE_MS = 2000

/** Validated plugin configuration. */
export interface Config {
  trailingSlash: TrailingSlash
  disposeGraceMs: number
}

export const Config: z<Config> = z.object({
  trailingSlash: z.union(['strict', 'ignore']).default('strict').description('Whether `/a` and `/a/` are different paths.'),
  disposeGraceMs: z.number().min(0).default(DEFAULT_DISPOSE_GRACE_MS).description('How long disposal waits for aborted requests (and their waitUntil tasks) to finish before it gives up on them.'),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    router: Router
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-router'

interface Flight {
  readonly controller: AbortController
  /** Settles when the handler is done and every `waitUntil` task it registered has settled. */
  readonly settled: Promise<unknown>
}

export class Router extends Service {
  private readonly table: RouteTable
  private readonly flights = new Set<Flight>()
  private closing = false
  private readonly graceMs: number

  constructor(ctx: Context, config: Partial<Config> = {}) {
    super(ctx, 'router')
    // The schema supplies these defaults when the Loader mounts the package; a plugin object mounted by hand skips the schema.
    const { trailingSlash = 'strict', disposeGraceMs = DEFAULT_DISPOSE_GRACE_MS } = config
    this.graceMs = disposeGraceMs
    this.table = new RouteTable({
      trailingSlash,
      onError: error => ctx.logger.error(`acryl-router: handler failed: ${error instanceof Error ? error.message : String(error)}`),
    })
    ctx.effect(() => async () => {
      this.closing = true
      const open = [...this.flights]
      for (const flight of open) flight.controller.abort()
      let timer: ReturnType<typeof setTimeout> | undefined
      const gaveUp = new Promise<'gave-up'>(resolve => { timer = setTimeout(() => { resolve('gave-up') }, this.graceMs) })
      const outcome = await Promise.race([Promise.allSettled(open.map(flight => flight.settled)).then(() => 'settled' as const), gaveUp])
      clearTimeout(timer)
      if (outcome === 'gave-up') ctx.logger.warn(`acryl-router: ${String(this.flights.size)} request(s) did not finish ${String(this.graceMs)} ms after abort; disposal continued without them`)
    }, 'acryl-router: abort and settle in-flight requests')
  }

  /** Routes plus middleware currently registered; a leak check for reload tests. */
  get size(): number {
    return this.table.size
  }

  /** Register a route owned by the calling plugin. Returns a remover; the route also goes away when the caller unloads. */
  route(method: RouteMethod, path: string, handler: Handler): () => void {
    const remove = this.table.add(method, path, handler)
    this.ctx.effect(() => () => { remove() }, `acryl-router: ${method} ${path}`)
    return remove
  }

  get(path: string, handler: Handler): () => void { return this.route('GET', path, handler) }
  post(path: string, handler: Handler): () => void { return this.route('POST', path, handler) }
  put(path: string, handler: Handler): () => void { return this.route('PUT', path, handler) }
  patch(path: string, handler: Handler): () => void { return this.route('PATCH', path, handler) }
  delete(path: string, handler: Handler): () => void { return this.route('DELETE', path, handler) }

  /** Register middleware for `path` and everything below it, owned by the calling plugin. */
  use(path: string, middleware: Middleware): () => void {
    const remove = this.table.use(path, middleware)
    this.ctx.effect(() => () => { remove() }, `acryl-router: use ${path}`)
    return remove
  }

  /**
   * Run a request in process. Never throws: failures become a 500, a disposed router answers 503. `connection` describes
   * the transport (an HTTP adapter passes the socket's peer address); an in-process caller omits it.
   */
  fetch(request: Request, connection: ConnectionInfo = {}): Promise<Response> {
    if (this.closing) return Promise.resolve(new Response('Service Unavailable', { status: 503 }))
    const controller = new AbortController()
    const forward = (): void => controller.abort()
    if (request.signal.aborted) controller.abort()
    else request.signal.addEventListener('abort', forward, { once: true })
    const tasks: Promise<unknown>[] = []
    // The caller gets the Response the moment the handler returns it; the flight lasts until every waitUntil task settles.
    const response = this.table.dispatch(request, controller.signal, connection, task => { tasks.push(task) })
    const settled = response.then(() => Promise.allSettled(tasks))
    const flight: Flight = { controller, settled }
    this.flights.add(flight)
    void settled.finally(() => {
      request.signal.removeEventListener('abort', forward)
      this.flights.delete(flight)
    })
    return response
  }
}

export function apply(ctx: Context, config: Partial<Config> = {}): void {
  new Router(ctx, config)
}
