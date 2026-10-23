/**
 * The registration API every router scope shares (Hono's `app.get`, `app.use`, `app.route`): the router itself is one scope with an empty prefix, and
 * `router.group('/api')` is another with a prefix. A scope never owns anything; every registration is released by the plugin that made it.
 */

import type { Context } from '@deepseek-ai/cordis'
import { compose } from './compose.ts'
import type { Handler, Method, Middleware, RouteMethod } from './types.ts'

/** The last argument is the handler; everything before it is middleware that runs for this route only. */
export type RouteHandlers = readonly [...Middleware[], Handler]

export type UseArguments = readonly [Middleware, ...Middleware[]] | readonly [string, Middleware, ...Middleware[]]

export interface Registrar {
  /** Register a route owned by the calling plugin. Returns a remover; the route also goes away when the caller unloads. */
  route(method: RouteMethod, path: string, ...handlers: RouteHandlers): () => void
  get(path: string, ...handlers: RouteHandlers): () => void
  post(path: string, ...handlers: RouteHandlers): () => void
  put(path: string, ...handlers: RouteHandlers): () => void
  patch(path: string, ...handlers: RouteHandlers): () => void
  delete(path: string, ...handlers: RouteHandlers): () => void
  /** A route that answers every method no more specific route claims. */
  all(path: string, ...handlers: RouteHandlers): () => void
  /** The same handlers on several methods. Returns one remover for all of them. */
  on(methods: Method | readonly Method[], path: string, ...handlers: RouteHandlers): () => void
  /** Middleware for a path and everything below it (default: everything in this scope), in registration order. */
  use(...args: UseArguments): () => void
  /** A scope whose paths all start with `prefix`; optional middleware runs for everything under it. */
  group(prefix: string, ...middleware: Middleware[]): Registrar
}

/** What a scope needs from the router: put one route or one middleware into the table, owned by `owner`. */
export interface Primitives {
  add(owner: Context, method: RouteMethod, path: string, handler: Handler): () => void
  use(owner: Context, path: string, middleware: Middleware): () => void
}

const PREFIX = /^\/(?:[^/*:\s]+(?:\/[^/*:\s]+)*)?$/

/** Join a scope prefix and a path: `('/api', '/x')` is `/api/x`, `('/api', '/')` is `/api`, and an empty prefix leaves the path alone. */
export function joinPath(prefix: string, path: string): string {
  if (prefix === '') return path
  if (path === '/' || path === '') return prefix
  if (!path.startsWith('/')) throw new TypeError(`router: path "${path}" must start with "/"`)
  return `${prefix}${path}`
}

function validatePrefix(prefix: string): void {
  if (prefix !== '' && !PREFIX.test(prefix)) throw new TypeError(`router: group prefix "${prefix}" must be a plain path like "/api" (no wildcard, no parameter, no trailing slash)`)
}

function single(handlers: RouteHandlers): Handler {
  const last = handlers.at(-1)
  if (last === undefined) throw new TypeError('router: a route needs a handler')
  const middleware = handlers.slice(0, -1) as Middleware[]
  return middleware.length === 0 ? last as Handler : compose(middleware, last as Handler)
}

export function createRegistrar(owner: Context, prefix: string, primitives: Primitives): Registrar {
  validatePrefix(prefix)
  const route = (method: RouteMethod, path: string, ...handlers: RouteHandlers): (() => void) =>
    primitives.add(owner, method, joinPath(prefix, path), single(handlers))
  const registrar: Registrar = {
    route,
    get: (path, ...h) => route('GET', path, ...h),
    post: (path, ...h) => route('POST', path, ...h),
    put: (path, ...h) => route('PUT', path, ...h),
    patch: (path, ...h) => route('PATCH', path, ...h),
    delete: (path, ...h) => route('DELETE', path, ...h),
    all: (path, ...h) => route('*', path, ...h),
    on: (methods, path, ...h) => {
      const removers = (Array.isArray(methods) ? methods as readonly Method[] : [methods as Method]).map(method => route(method, path, ...h))
      return () => { for (const remove of removers) remove() }
    },
    use: (...args) => {
      const [first, ...rest] = args as readonly [string | Middleware, ...Middleware[]]
      const path = typeof first === 'string' ? first : '/'
      const middleware = typeof first === 'string' ? rest : [first, ...rest]
      const removers = middleware.map(mw => primitives.use(owner, joinPath(prefix, path), mw))
      return () => { for (const remove of removers) remove() }
    },
    group: (nested, ...middleware) => {
      const scope = createRegistrar(owner, joinPath(prefix, nested), primitives)
      if (middleware.length > 0) scope.use(...(middleware as [Middleware, ...Middleware[]]))
      return scope
    },
  }
  return registrar
}
