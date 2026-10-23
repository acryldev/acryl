/** HTTP methods a route can answer; `*` answers any method not claimed by a more specific route. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type RouteMethod = Method | '*'

/** How a trailing slash is read: `strict` keeps `/a` and `/a/` distinct, `ignore` treats them as one path. */
export type TrailingSlash = 'strict' | 'ignore'

/**
 * Facts about the transport the request arrived on, supplied by the caller of `fetch` and never by the request itself.
 * An in-process caller (the terminal UI) passes nothing, so a handler that needs a trusted peer must refuse it.
 */
export interface ConnectionInfo {
  /** The peer address of the socket, when the request came over one (for example `127.0.0.1`). */
  readonly remoteAddress?: string | undefined
}

/** What a handler or middleware sees. Deliberately small: the Web-standard request plus a few response helpers. */
export interface RouteContext {
  /** The incoming request. */
  readonly req: Request
  /** Parsed `req.url`. */
  readonly url: URL
  /** Matched `:name` segments, and `*` for the remainder of a wildcard route. Values are URL-decoded. */
  readonly params: Readonly<Record<string, string>>
  /** The transport the request arrived on; empty for an in-process call. */
  readonly connection: ConnectionInfo
  /** Aborted when the caller aborts the request or when the router is disposed. Handlers should honor it. */
  readonly signal: AbortSignal
  /** Request-scoped values shared between middleware and the handler. */
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  /**
   * Keep this request "in flight" until `task` settles, even after the handler returned its `Response`. A handler that
   * streams (server-sent events) registers the promise that resolves when its stream ends; disposing the router aborts
   * `signal` and waits for it, so a stream never outlives the plugin that served it.
   */
  waitUntil(task: Promise<unknown>): void
  json(data: unknown, status?: number): Response
  text(body: string, status?: number): Response
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response
}

export type Handler = (c: RouteContext) => Response | Promise<Response>
export type Next = () => Promise<Response>
export type Middleware = (c: RouteContext, next: Next) => Response | Promise<Response>
