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
import { createRegistrar, type Primitives, type Registrar, type RouteHandlers, type UseArguments } from './registrar.ts'
import { RouteTable } from './table.ts'
import type { ConnectionInfo, ErrorHandler, Method, Middleware, NotFoundHandler, RouteMethod, TrailingSlash } from './types.ts'

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

  private readonly primitives: Primitives = {
    add: (owner, method, path, handler) => {
      const remove = this.table.add(method, path, handler)
      owner.effect(() => () => { remove() }, `acryl-router: ${method} ${path}`)
      return remove
    },
    use: (owner, path, middleware) => {
      const remove = this.table.use(path, middleware)
      owner.effect(() => () => { remove() }, `acryl-router: use ${path}`)
      return remove
    },
  }

  /** The scope the calling plugin registers into; `this.ctx` is the caller's context for the duration of a call made through `ctx.router`. */
  private scope(): Registrar {
    return createRegistrar(this.ctx, '', this.primitives)
  }

  route(method: RouteMethod, path: string, ...handlers: RouteHandlers): () => void { return this.scope().route(method, path, ...handlers) }
  get(path: string, ...handlers: RouteHandlers): () => void { return this.scope().get(path, ...handlers) }
  post(path: string, ...handlers: RouteHandlers): () => void { return this.scope().post(path, ...handlers) }
  put(path: string, ...handlers: RouteHandlers): () => void { return this.scope().put(path, ...handlers) }
  patch(path: string, ...handlers: RouteHandlers): () => void { return this.scope().patch(path, ...handlers) }
  delete(path: string, ...handlers: RouteHandlers): () => void { return this.scope().delete(path, ...handlers) }
  all(path: string, ...handlers: RouteHandlers): () => void { return this.scope().all(path, ...handlers) }
  on(methods: Method | readonly Method[], path: string, ...handlers: RouteHandlers): () => void { return this.scope().on(methods, path, ...handlers) }
  use(...args: UseArguments): () => void { return this.scope().use(...args) }
  group(prefix: string, ...middleware: Middleware[]): Registrar { return this.scope().group(prefix, ...middleware) }

  /** Turn errors into responses. One handler per router; the calling plugin owns it. */
  onError(handler: ErrorHandler): () => void {
    const remove = this.table.setErrorHandler(handler)
    this.ctx.effect(() => () => { remove() }, 'acryl-router: onError')
    return remove
  }

  /** Answer requests no route claimed. One handler per router; the calling plugin owns it. */
  notFound(handler: NotFoundHandler): () => void {
    const remove = this.table.setNotFoundHandler(handler)
    this.ctx.effect(() => () => { remove() }, 'acryl-router: notFound')
    return remove
  }

  /**
   * Call the router the way a test calls an app (Hono's `app.request`): a path or URL string, a `URL` or a `Request`, with the usual init.
   * A relative path is resolved against `http://localhost`.
   */
  request(input: string | URL | Request, init?: RequestInit, connection?: ConnectionInfo): Promise<Response> {
    const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost'), init)
    return this.fetch(request, connection)
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
