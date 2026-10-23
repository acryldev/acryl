/** HTTP methods a route can answer; `*` answers any method not claimed by a more specific route. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type RouteMethod = Method | '*'

/** How a trailing slash is read: `strict` keeps `/a` and `/a/` distinct, `ignore` treats them as one path. */
export type TrailingSlash = 'strict' | 'ignore'

/** What a handler or middleware sees. Deliberately small: the Web-standard request plus a few response helpers. */
export interface RouteContext {
  /** The incoming request. */
  readonly req: Request
  /** Parsed `req.url`. */
  readonly url: URL
  /** Matched `:name` segments, and `*` for the remainder of a wildcard route. Values are URL-decoded. */
  readonly params: Readonly<Record<string, string>>
  /** Aborted when the caller aborts the request or when the router is disposed. Handlers should honor it. */
  readonly signal: AbortSignal
  /** Request-scoped values shared between middleware and the handler. */
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  json(data: unknown, status?: number): Response
  text(body: string, status?: number): Response
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response
}

export type Handler = (c: RouteContext) => Response | Promise<Response>
export type Next = () => Promise<Response>
export type Middleware = (c: RouteContext, next: Next) => Response | Promise<Response>
