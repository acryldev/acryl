import type { RouteContext } from './types.ts'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const
const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' } as const

/** Build the per-request context. */
export function createContext(req: Request, params: Record<string, string>, signal: AbortSignal): RouteContext {
  const values = new Map<string, unknown>()
  return {
    req,
    url: new URL(req.url),
    params,
    signal,
    get: <T>(key: string) => values.get(key) as T | undefined,
    set: (key, value) => { values.set(key, value) },
    json: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }),
    text: (body, status = 200) => new Response(body, { status, headers: TEXT_HEADERS }),
    redirect: (location, status = 302) => new Response(null, { status, headers: { location } }),
  }
}
