import { compose } from './compose.ts'
import { createContext } from './context.ts'
import { compareSpecificity, compilePattern, matchPattern, shapeOf, splitPath, type Pattern } from './pattern.ts'
import type { ConnectionInfo, Handler, Middleware, RouteMethod, TrailingSlash } from './types.ts'

interface RouteEntry {
  readonly method: RouteMethod
  readonly pattern: Pattern
  readonly handler: Handler
}

interface MiddlewareEntry {
  readonly pattern: Pattern
  readonly middleware: Middleware
}

export interface RouteTableOptions {
  readonly trailingSlash: TrailingSlash
  /** Called with anything a handler or middleware throws; the caller still receives a 500. */
  readonly onError?: (error: unknown) => void
}

/**
 * The routing core: pure data and matching, no Cordis. Registrations return an idempotent remover, and the table keeps
 * insertion order so middleware runs in registration order. Matching picks the most specific route (static before
 * parameter before wildcard) among those that answer the request method.
 */
export class RouteTable {
  private readonly routes = new Map<string, RouteEntry>()
  private readonly middleware = new Map<symbol, MiddlewareEntry>()

  private readonly options: RouteTableOptions

  constructor(options: RouteTableOptions) {
    this.options = options
  }

  /** Routes plus middleware currently registered. A reload that leaks registrations makes this grow. */
  get size(): number {
    return this.routes.size + this.middleware.size
  }

  add(method: RouteMethod, path: string, handler: Handler): () => void {
    const pattern = compilePattern(path, this.options.trailingSlash)
    const key = `${method} ${shapeOf(pattern)}`
    if (this.routes.has(key)) throw new Error(`router: duplicate route ${method} ${path}`)
    const entry: RouteEntry = { method, pattern, handler }
    this.routes.set(key, entry)
    return () => {
      if (this.routes.get(key) === entry) this.routes.delete(key)
    }
  }

  /** Register middleware for `path` and everything below it (`/` means every request). */
  use(path: string, middleware: Middleware): () => void {
    const compiled = compilePattern(path, this.options.trailingSlash)
    const last = compiled.segments.at(-1)
    const pattern: Pattern = last?.kind === 'wildcard'
      ? compiled
      : { source: compiled.source, segments: [...compiled.segments, { kind: 'wildcard' }] }
    const id = Symbol(path)
    this.middleware.set(id, { pattern, middleware })
    return () => { this.middleware.delete(id) }
  }

  private hasMethod(method: RouteMethod, parts: readonly string[]): boolean {
    for (const entry of this.routes.values()) {
      if (entry.method === method && matchPattern(entry.pattern, parts) !== undefined) return true
    }
    return false
  }

  async dispatch(req: Request, signal: AbortSignal, connection: ConnectionInfo = {}): Promise<Response> {
    const parts = splitPath(new URL(req.url).pathname, this.options.trailingSlash)
    const method = req.method.toUpperCase()

    let best: { entry: RouteEntry, params: Record<string, string> } | undefined
    const allowed = new Set<string>()
    // HEAD is answered by the GET route when no route claims HEAD itself, and the body is dropped below.
    const headFromGet = method === 'HEAD' && !this.hasMethod('HEAD', parts)
    for (const entry of this.routes.values()) {
      const params = matchPattern(entry.pattern, parts)
      if (params === undefined) continue
      allowed.add(entry.method)
      if (entry.method === 'GET') allowed.add('HEAD')
      const answers = entry.method === '*' || entry.method === method || (headFromGet && entry.method === 'GET')
      if (!answers) continue
      if (best === undefined || isBetter(entry, best.entry)) best = { entry, params }
    }

    const chain: Middleware[] = []
    for (const entry of this.middleware.values()) {
      if (matchPattern(entry.pattern, parts) !== undefined) chain.push(entry.middleware)
    }

    const final: Handler = best !== undefined
      ? best.entry.handler
      : allowed.size > 0 && !allowed.has('*')
        ? () => new Response('Method Not Allowed', { status: 405, headers: { allow: [...allowed].sort().join(', ') } })
        : () => new Response('Not Found', { status: 404 })

    const context = createContext(req, best?.params ?? {}, signal, connection)
    try {
      const response = await compose(chain, final)(context)
      return method === 'HEAD' ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers }) : response
    } catch (error) {
      if (signal.aborted) return new Response('Request aborted', { status: 499 })
      this.options.onError?.(error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

function isBetter(candidate: RouteEntry, current: RouteEntry): boolean {
  const order = compareSpecificity(candidate.pattern, current.pattern)
  if (order !== 0) return order > 0
  return current.method === '*' && candidate.method !== '*'
}
