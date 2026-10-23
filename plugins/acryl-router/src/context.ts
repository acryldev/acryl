import type { ConnectionInfo, ResponseBody, RouteContext } from './types.ts'

const JSON_TYPE = 'application/json; charset=utf-8'
const TEXT_TYPE = 'text/plain; charset=utf-8'
const HTML_TYPE = 'text/html; charset=utf-8'

/** Statuses that must not carry a body; a `Response` constructed with one throws. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])
const bodyFor = <T>(status: number, body: T): T | null => NULL_BODY_STATUSES.has(status) ? null : body

/** Build the per-request context. `notFound` is what `c.notFound()` runs: the router's own answer. */
export function createContext(
  req: Request,
  params: Record<string, string>,
  signal: AbortSignal,
  connection: ConnectionInfo,
  track: (task: Promise<unknown>) => void,
  notFound: (c: RouteContext) => Response | Promise<Response>,
): RouteContext {
  const values = new Map<string, unknown>()
  const url = new URL(req.url)
  const defaults = new Headers()
  let defaultStatus = 200

  const respond = (body: ResponseBody, status: number | undefined, type: string | undefined, extra?: Record<string, string>): Response => {
    const code = status ?? defaultStatus
    const headers = new Headers(defaults)
    if (type !== undefined && !headers.has('content-type')) headers.set('content-type', type)
    for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value)
    return new Response(bodyFor(code, body), { status: code, headers })
  }

  const context: RouteContext = {
    req,
    url,
    params,
    connection,
    signal,
    waitUntil: track,
    get: <T>(key: string) => values.get(key) as T | undefined,
    set: (key, value) => { values.set(key, value) },
    header: (name, value) => { defaults.set(name, value) },
    status: code => { defaultStatus = code },
    query: ((name?: string) => {
      if (name !== undefined) return url.searchParams.get(name) ?? undefined
      const all: Record<string, string> = {}
      for (const [key, value] of url.searchParams) if (!(key in all)) all[key] = value
      return all
    }) as RouteContext['query'],
    param: ((name?: string) => name === undefined ? params : params[name]) as RouteContext['param'],
    json: (data, status) => respond(JSON.stringify(data), status, JSON_TYPE),
    text: (body, status) => respond(body, status, TEXT_TYPE),
    html: (body, status) => respond(body, status, HTML_TYPE),
    body: (data, status, headers) => respond(data, status, undefined, headers),
    redirect: (location, status = 302) => respond(null, status, undefined, { location }),
    notFound: () => notFound(context),
  }
  return context
}
