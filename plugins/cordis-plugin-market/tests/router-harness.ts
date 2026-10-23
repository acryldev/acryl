/**
 * Test-only stand-ins for the `router` and `routerHttp` services the market now injects (spec 046, M2). They are the real
 * routing core (`RouteTable`) and the real node bridge (`serve`), wired to a fake `webServer` the way the production
 * plugins are wired to the DSH one, so a test sees the same request path a browser does.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { RouteTable, type ConnectionInfo, type Handler, type Middleware, type RouteMethod } from 'acryl-router'
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

/** The router services over a table, mounting through `webServer.register` like the production adapter does. */
export function routerServices(webServer: { register(route: FakeRoute): () => void }) {
  const table = new RouteTable({ trailingSlash: 'strict' })
  const router = {
    route: (method: RouteMethod, path: string, handler: Handler) => table.add(method, path, handler),
    get: (path: string, handler: Handler) => table.add('GET', path, handler),
    post: (path: string, handler: Handler) => table.add('POST', path, handler),
    use: (path: string, middleware: Middleware) => table.use(path, middleware),
    fetch: (request: Request, connection?: ConnectionInfo) => table.dispatch(request, new AbortController().signal, connection),
    get size() { return table.size },
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
