/**
 * Test-only stand-ins for the `router` and `routerHttp` services the market injects. They compose the real core `App` from
 * the live mounts on every request, as the router service does, and serve through the real node bridge (`serve`), wired to a
 * fake `webServer` the way the production plugins are wired to the DSH one, so a test sees the same request path a browser does.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { App, type ConnectionInfo, type MountableApp } from 'acryl-router'
import { serve } from 'acryl-router-http'

export interface FakeRoute {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** A `webServer` that keeps its routes and finds one for a pathname with the real rule: exact, then longest prefix. */
export class FakeWebServer {
  readonly routes = new Map<string, FakeRoute>()
  constructor(readonly port: number) {}

  register = (route: FakeRoute): (() => void) => {
    const key = `${route.kind}:${route.path}`
    if (this.routes.has(key)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    this.routes.set(key, route)
    return () => { this.routes.delete(key) }
  }

  match(pathname: string): FakeRoute | undefined {
    const exact = this.routes.get(`exact:${pathname}`)
    if (exact !== undefined) return exact
    let best: FakeRoute | undefined
    for (const route of this.routes.values()) {
      if (route.kind !== 'prefix') continue
      if (pathname !== route.path && !pathname.startsWith(`${route.path}/`)) continue
      if (best === undefined || route.path.length > best.path.length) best = route
    }
    return best
  }
}

/** The router services over a list of mounts, mounting through `webServer.register` like the production adapter does. */
export function routerServices(webServer: { register(route: FakeRoute): () => void }) {
  const mounts = new Set<{ readonly path: string, readonly app: MountableApp }>()
  const router = {
    route: (path: string, app: MountableApp): (() => void) => {
      const mount = { path, app }
      mounts.add(mount)
      return () => { mounts.delete(mount) }
    },
    // The request's own signal is the abort signal, as the real router derives it from the caller's.
    fetch: async (request: Request, connection: ConnectionInfo = {}): Promise<Response> => {
      const root = new App()
      for (const mount of mounts) root.route(mount.path, mount.app)
      return root.fetch(request, { connection }, { waitUntil: () => {}, passThroughOnException: () => {}, props: {} })
    },
    get size() { return mounts.size },
    /** Routes across every mount, the way the core lists them. */
    get routeCount() { let count = 0; for (const mount of mounts) count += mount.app.routes.length; return count },
  }
  const routerHttp = {
    mount: (prefix: string) => webServer.register({ kind: 'prefix', path: prefix, handler: (req, res) => serve(router, req, res) }),
  }
  return { router, routerHttp }
}

/** A fake Host context with the router services added over the context's own `webServer`. */
export function withRouter<T extends { readonly webServer: { register(route: never): () => void } }>(ctx: T) {
  return { ...ctx, ...routerServices(ctx.webServer as unknown as { register(route: FakeRoute): () => void }) }
}

export interface RouteCall {
  readonly method?: string
  /** A JSON-serializable body, sent with a JSON content type. */
  readonly json?: unknown
  /** A raw body, sent as given. */
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
  /** The transport facts; the defaults are a loopback peer on the port the tests put in their `Host` header. */
  readonly connection?: ConnectionInfo
  readonly signal?: AbortSignal
}

export interface RouteResult {
  readonly status: number
  readonly headers: Headers
  /** The parsed JSON body, or undefined when the body is empty or not JSON. */
  readonly body: unknown
}

export const TEST_PORT = 43_120
export const loopbackHeaders = (extra: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  host: `127.0.0.1:${String(TEST_PORT)}`,
  origin: `http://127.0.0.1:${String(TEST_PORT)}`,
  'sec-fetch-site': 'same-origin',
  ...extra,
})

/** Call a route the way the HTTP adapter would, in process, and read the response. */
export async function callRoute(
  router: { fetch(request: Request, connection?: ConnectionInfo): Promise<Response> },
  path: string,
  call: RouteCall = {},
): Promise<RouteResult> {
  const method = call.method ?? 'GET'
  const headers = { ...loopbackHeaders(), ...call.headers, ...(call.json === undefined ? {} : { 'content-type': 'application/json' }) }
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = !hasBody ? undefined : call.json !== undefined ? JSON.stringify(call.json) : call.body
  const request = new Request(`http://127.0.0.1:${String(TEST_PORT)}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(call.signal === undefined ? {} : { signal: call.signal }),
  })
  const response = await router.fetch(request, call.connection ?? { remoteAddress: '127.0.0.1', localPort: TEST_PORT })
  const text = await response.text()
  let parsed: unknown
  try { parsed = text === '' ? undefined : JSON.parse(text) as unknown } catch { parsed = undefined }
  return { status: response.status, headers: response.headers, body: parsed }
}
