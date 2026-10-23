/**
 * The two conversions between `node:http` and Web-standard fetch objects. Pure functions, no Cordis, so the adapter's
 * behavior is testable without a server.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const FALLBACK_ORIGIN = 'http://localhost'

/** Build the Web `Request` for an incoming message. The body, when the method has one, is streamed, not buffered. */
export function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  let url: URL
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  } catch {
    url = new URL(req.url ?? '/', FALLBACK_ORIGIN)
  }
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) headers.append(key, item)
    else headers.set(key, value)
  }
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers, signal })
  // Node's fetch requires `duplex: 'half'` for a streamed body; the DOM lib's `RequestInit` does not declare the field yet.
  const init: RequestInit & { duplex: 'half' } = { method, headers, signal, body: Readable.toWeb(req) as ReadableStream, duplex: 'half' }
  return new Request(url, init)
}

/**
 * Write a Web `Response` to the node response: status, headers (repeated `set-cookie` kept separate) and the streamed body.
 * A client that disconnects mid-stream ends the copy quietly; the caller's abort signal is what stops the handler.
 */
export async function sendResponse(res: ServerResponse, response: Response, method: string): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => { if (key !== 'set-cookie') headers[key] = value })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  // A stream may stay silent for a while; the status line and headers must reach the client now, not with the first chunk.
  res.flushHeaders()
  if (response.body === null || method === 'HEAD') {
    res.end()
    return
  }
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res)
  } catch {
    if (!res.writableEnded) res.destroy()
  }
}
