/**
 * The ACRYL router service (`ctx.router`): plugin-owned `App` mounts on Web-standard Request and Response.
 *
 * A plugin builds an ordinary `App` and mounts it with `ctx.router.route(path, app)` from its own context, so the mount disappears when that
 * plugin unloads. `fetch(request)` runs a request in process: Web and Desktop serve it behind HTTP through an adapter, the terminal UI calls
 * it directly, so one handler serves every surface without opening a socket. Disposal refuses new requests, aborts in-flight ones, ends any
 * response body still streaming and waits for all of it to settle.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionInfo, RouterBindings } from './connection.ts'
import { App } from './core/app.ts'
import type { ExecutionContext } from './core/context.ts'
import { HTTPException } from './core/http-exception.ts'
import { TrieRouter } from './core/router/trie-router/index.ts'
import { COMPOSED_HANDLER } from './core/utils/constants.ts'
import { mergePath } from './core/utils/url.ts'
import type { ErrorHandler, H, NotFoundHandler } from './core/types.ts'

const DEFAULT_DISPOSE_GRACE_MS = 2000

/** How a trailing slash is read: `strict` keeps `/a` and `/a/` distinct, `ignore` treats them as one path. */
export type TrailingSlash = 'strict' | 'ignore'

/** Validated plugin configuration. */
export interface Config {
  trailingSlash: TrailingSlash
  disposeGraceMs: number
}

/** Every field has a default, so a caller passes only what it changes: `ctx.plugin(plugin, { ... })` takes the partial shape. */
export const Config: z<Partial<Config>, Config> = z.object({
  trailingSlash: z.union(['strict', 'ignore']).default('strict').description('Whether `/a` and `/a/` are different paths.'),
  disposeGraceMs: z.number().min(0).default(DEFAULT_DISPOSE_GRACE_MS).description('How long disposal waits for aborted requests, their response bodies and their waitUntil tasks before it gives up on them.'),
})

/**
 * The Web adapter's service (`ctx.routerHttp`, provided by `acryl-router-http`). Declared here, beside `router`, so a plugin can ask for its routes to be
 * served over HTTP without depending on the adapter package.
 */
export interface RouterHttpService {
  /** Serve `prefix` and everything below it through the router; returns a remover. The mount also goes away when the calling plugin unloads. */
  mount(prefix: string): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    router: Router
    routerHttp: RouterHttpService
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-router'

// Any `App`, whatever its Env and schema; the router only reads its routes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MountableApp = App<any, any, any>

interface Mount {
  readonly path: string
  readonly app: MountableApp
}

interface RouterState {
  readonly mounts: Set<Mount>
  errorHandler: ErrorHandler | undefined
  notFoundHandler: NotFoundHandler | undefined
  /** The app composed from the live mounts; dropped on every change and composed again by the next request. */
  composed: App | undefined
  closing: boolean
}

interface Flight {
  readonly controller: AbortController
  /** How many of each mount's handlers are running for this request right now (a middleware counts until its `next()` returns). */
  readonly running: Map<Mount, number>
  /** The mount whose handler produced the response; its body is that mount's code still running. */
  producer: Mount | undefined
  /** Ends the response body early (disposal); a no-op once the body is done or when there is none. */
  readonly endBody: () => void
  /** Settles when the handler is done, its body has been read or cancelled, and every `waitUntil` task it registered has settled. */
  readonly settled: Promise<unknown>
}

/** Wait for `tasks`, including any added while waiting (a stream may register more after the handler returned). */
async function drain(tasks: readonly Promise<unknown>[]): Promise<void> {
  let seen = 0
  while (seen < tasks.length) {
    const batch = tasks.slice(seen)
    seen = tasks.length
    await Promise.allSettled(batch)
  }
}

export class Router extends Service {
  /** Everything that changes after construction, kept in one object so the service's live state is in one place. */
  private readonly state: RouterState = { mounts: new Set(), errorHandler: undefined, notFoundHandler: undefined, composed: undefined, closing: false }
  private readonly flights = new Set<Flight>()
  /** The flight of each request the router dispatched, keyed by the request its handlers see as `c.req.raw`. */
  private readonly flightOf = new WeakMap<Request, Flight>()
  private readonly strict: boolean
  private readonly graceMs: number
  private readonly logError: ErrorHandler

  constructor(ctx: Context, config: Partial<Config> = {}) {
    super(ctx, 'router')
    // The schema supplies these defaults when the Loader mounts the package; a plugin object mounted by hand skips the schema.
    const { trailingSlash = 'strict', disposeGraceMs = DEFAULT_DISPOSE_GRACE_MS } = config
    this.strict = trailingSlash === 'strict'
    this.graceMs = disposeGraceMs
    this.logError = (error, c) => {
      if (error instanceof HTTPException) return error.getResponse()
      // A handler that gave up because its caller left or the router is closing is not a failure worth logging.
      if (c.req.raw.signal.aborted) return new Response('Client Closed Request', { status: 499 })
      ctx.logger.error(`acryl-router: handler failed: ${error instanceof Error ? error.message : String(error)}`)
      return c.text('Internal Server Error', 500)
    }
    ctx.effect(() => async () => {
      this.state.closing = true
      await this.end([...this.flights], 'disposal')
    }, 'acryl-router: abort and settle in-flight requests')
  }

  /** Registrations currently held (mounts, and the router-wide error and not-found handlers); a leak check for reload tests. */
  get size(): number {
    return this.state.mounts.size + (this.state.errorHandler === undefined ? 0 : 1) + (this.state.notFoundHandler === undefined ? 0 : 1)
  }

  /**
   * Serve `app` under `path` (`'/'` for its own paths as they are). The mount belongs to the calling plugin and goes away when it unloads;
   * the returned function removes it sooner. Mounts are composed in the order they were made. Like the core's own `app.route`, the routes
   * are copied now: one the app registers after this call is not served (mount again, or finish the app first).
   */
  route(path: string, app: MountableApp): () => void {
    const mount = this.snapshot(path, app)
    this.state.mounts.add(mount)
    this.state.composed = undefined
    // Removing a mount ends the requests its code is still serving: their signals abort, a body it produced is cancelled, and the
    // plugin's unload waits for them (bounded by `disposeGraceMs`), so nothing a plugin started outlives it.
    const remove = (): Promise<void> => {
      if (!this.state.mounts.delete(mount)) return Promise.resolve()
      this.state.composed = undefined
      return this.end([...this.flights].filter(flight => (flight.running.get(mount) ?? 0) > 0 || flight.producer === mount), `removing ${path}`)
    }
    // Each route the mount serves is a child effect of it, labeled on its own, so the inspector can report routes without asking the
    // router and no label grows with the size of the app (`ALL` is middleware or `all`). The children hold nothing: the mount does.
    // (Cordis adopts an effect as a child only when the parent's body yields it.)
    const served = new Set(app.routes.map(route => `${route.method} ${mergePath(path, route.path)}`))
    const owner = this.ctx
    owner.effect(function* () {
      for (const route of served) yield owner.effect(() => () => {}, `acryl-router: serves ${route}`)
      yield remove
    }, `acryl-router: route ${path}`)
    return () => { void remove() }
  }

  /**
   * The mount's own copy of `app`'s routes as they are now (like the core's `app.route`), each handler wrapped so the router knows which
   * mount's code a request is in. The core's `app.route` runs first so a sub-app's own `onError` still applies to its routes.
   */
  private snapshot(path: string, app: MountableApp): Mount {
    const copy = new App().route('/', app)
    const tagged = new App()
    const mount: Mount = { path, app: tagged }
    for (const route of copy.routes) {
      const inner = route.handler
      const handler: H = async (c, next) => {
        const flight = this.flightOf.get(c.req.raw)
        if (flight === undefined) return inner(c, next)
        let calledNext = false
        flight.running.set(mount, (flight.running.get(mount) ?? 0) + 1)
        try {
          const result = await inner(c, () => { calledNext = true; return next() })
          if (!calledNext && result instanceof Response) flight.producer = mount
          return result
        } finally {
          flight.running.set(mount, (flight.running.get(mount) ?? 1) - 1)
        }
      }
      ;(handler as unknown as Record<string, unknown>)[COMPOSED_HANDLER] = inner
      tagged.on(route.method, route.path, handler)
    }
    return mount
  }

  /** Abort `flights`, cut their bodies short and wait for them to settle, at most `disposeGraceMs`. */
  private async end(flights: readonly Flight[], why: string): Promise<void> {
    if (flights.length === 0) return
    for (const flight of flights) {
      flight.controller.abort()
      flight.endBody()
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const gaveUp = new Promise<'gave-up'>(resolve => { timer = setTimeout(() => { resolve('gave-up') }, this.graceMs) })
    const outcome = await Promise.race([Promise.allSettled(flights.map(flight => flight.settled)).then(() => 'settled' as const), gaveUp])
    clearTimeout(timer)
    if (outcome === 'gave-up') this.ctx.logger.warn(`acryl-router: ${String(flights.length)} request(s) did not finish ${String(this.graceMs)} ms after abort (${why}); continued without them`)
  }

  /** Turn errors no mounted app handled into responses. One handler per router; the calling plugin owns it. */
  onError(handler: ErrorHandler): () => void {
    if (this.state.errorHandler !== undefined) throw new Error('router: an error handler is already registered')
    this.state.errorHandler = handler
    this.state.composed = undefined
    const remove = (): void => {
      if (this.state.errorHandler !== handler) return
      this.state.errorHandler = undefined
      this.state.composed = undefined
    }
    this.ctx.effect(() => remove, 'acryl-router: onError')
    return remove
  }

  /** Answer requests no route claimed. One handler per router; the calling plugin owns it. */
  notFound(handler: NotFoundHandler): () => void {
    if (this.state.notFoundHandler !== undefined) throw new Error('router: a not-found handler is already registered')
    this.state.notFoundHandler = handler
    this.state.composed = undefined
    const remove = (): void => {
      if (this.state.notFoundHandler !== handler) return
      this.state.notFoundHandler = undefined
      this.state.composed = undefined
    }
    this.ctx.effect(() => remove, 'acryl-router: notFound')
    return remove
  }

  /**
   * Call the router the way a test calls an app: a path or URL string, a `URL` or a `Request`, with the usual init.
   * A relative path is resolved against `http://localhost`.
   */
  request(input: string | URL | Request, init?: RequestInit, connection?: ConnectionInfo): Promise<Response> {
    const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost'), init)
    return this.fetch(request, connection)
  }

  /**
   * Run a request in process. Never throws: failures become a 500, a disposed router answers 503. `connection` describes the transport
   * (an HTTP adapter passes the socket's peer address and local port); an in-process caller omits it. Handlers read it with
   * `connectionOf(c)`, abort with `c.req.raw.signal` and keep the request in flight with `c.executionCtx.waitUntil(task)`.
   */
  fetch(request: Request, connection: ConnectionInfo = {}): Promise<Response> {
    if (this.state.closing) return Promise.resolve(new Response('Service Unavailable', { status: 503 }))
    const controller = new AbortController()
    const forward = (): void => controller.abort()
    if (request.signal.aborted) controller.abort()
    else request.signal.addEventListener('abort', forward, { once: true })
    const tasks: Promise<unknown>[] = []
    const executionCtx: ExecutionContext = {
      waitUntil: task => { tasks.push(task) },
      passThroughOnException: () => {},
      props: {},
    }
    const env: RouterBindings = { connection }
    let bodyDone: Promise<void> = Promise.resolve()
    let endBody = (): void => {}
    let resolveSettled!: (value: Promise<unknown>) => void
    const flight: Flight = { controller, running: new Map(), producer: undefined, endBody: () => { endBody() }, settled: new Promise(resolve => { resolveSettled = resolve }) }
    const inner = new Request(request, { signal: controller.signal })
    this.flightOf.set(inner, flight)
    // The caller gets the Response the moment the handler returns it; the flight lasts until its body ends and every waitUntil task settles.
    const response = this.dispatch(inner, env, executionCtx).then(raw => {
      const tracked = this.track(raw)
      bodyDone = tracked.done
      endBody = tracked.end
      // Aborted before the handler answered (disposal, or the caller left): nobody is going to read this body, so end it now.
      if (controller.signal.aborted) tracked.end()
      return tracked.response
    })
    const settled = response.then(async () => {
      await bodyDone
      await drain(tasks)
    })
    resolveSettled(settled)
    this.flights.add(flight)
    void settled.finally(() => {
      request.signal.removeEventListener('abort', forward)
      this.flights.delete(flight)
    })
    return response
  }

  private async dispatch(request: Request, env: RouterBindings, executionCtx: ExecutionContext): Promise<Response> {
    try {
      return await this.app().fetch(request, env, executionCtx)
    } catch (error) {
      this.ctx.logger.error(`acryl-router: request failed: ${error instanceof Error ? error.message : String(error)}`)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  private app(): App {
    if (this.state.composed !== undefined) return this.state.composed
    // The trie router, because the composed app is rebuilt after every mount change: the default matcher compiles one regular expression
    // over all routes on its first request, which grows faster than the route count (measured: 22 ms at 1000 routes, 163 ms at 2000),
    // while the trie rebuilds in about 1 ms per 1000 routes and matches as fast (scripts/bench-remount.mjs).
    const root = new App({ strict: this.strict, router: new TrieRouter() })
    for (const mount of this.state.mounts) root.route(mount.path, mount.app)
    root.onError(this.state.errorHandler ?? this.logError)
    if (this.state.notFoundHandler !== undefined) root.notFound(this.state.notFoundHandler)
    this.state.composed = root
    return root
  }

  /**
   * Hand the caller a body the router can end. Reading it passes the handler's chunks through; disposal cancels the handler's stream (which runs
   * the stream helpers' own abort cleanup) and closes the caller's side, so a stream never outlives the plugin that served it.
   */
  private track(response: Response): { response: Response, done: Promise<void>, end: () => void } {
    const source = response.body
    if (source === null) return { response, done: Promise.resolve(), end: () => {} }
    const reader = source.getReader()
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    let ended = false
    let sink: ReadableStreamDefaultController<Uint8Array> | undefined
    const end = (): void => {
      if (ended) return
      ended = true
      finish()
    }
    const endEarly = (): void => {
      if (ended) return
      reader.cancel(new Error('acryl-router: disposed')).catch(() => {})
      try { sink?.close() } catch { /* already closed */ }
      end()
    }
    const body = new ReadableStream<Uint8Array>({
      start: controller => { sink = controller },
      pull: async controller => {
        try {
          const chunk = await reader.read()
          if (ended) return
          if (chunk.done) {
            controller.close()
            end()
          } else {
            controller.enqueue(chunk.value)
          }
        } catch (error) {
          if (!ended) controller.error(error)
          end()
        }
      },
      cancel: async reason => {
        end()
        await reader.cancel(reason)
      },
    })
    return {
      response: new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }),
      done,
      end: endEarly,
    }
  }
}

export function apply(ctx: Context, config: Partial<Config> = {}): void {
  new Router(ctx, config)
}
