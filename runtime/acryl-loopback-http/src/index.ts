/**
 * Strict loopback HTTP helpers for private Host routes.
 *
 * Every private route (the workspace's terminal, git and files routes, plugin administration, Desktop's
 * settings) must be reachable only from the app's own page on the loopback interface. This is the single
 * implementation of that check, plus a bounded JSON body reader and uniform JSON responses, so a fix lands
 * once for all of them.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** The default cap on a JSON request body. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024

/** Thrown by {@link readJsonBody} when the body is larger than allowed. */
export class BodyTooLargeError extends Error {}

/** Write one JSON response with the no-store and nosniff headers every private route uses. */
export function finishJson(
  res: ServerResponse,
  statusCode: number,
  value: object,
  allow?: 'GET' | 'POST',
): void {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  if (allow !== undefined) res.setHeader('allow', allow)
  res.end(JSON.stringify(value))
}

export function error(message: string): { readonly error: string } {
  return { error: message }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]'
}

/** True for the IPv4 and IPv6 loopback addresses, including an IPv4 address mapped into IPv6. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  if (address === '::1' || address === '127.0.0.1') return true
  if (address.startsWith('::ffff:')) return address.slice('::ffff:'.length).startsWith('127.')
  return address.startsWith('127.')
}

function expectedLoopbackOrigin(expectedOrigin: string): URL | undefined {
  try {
    const url = new URL(expectedOrigin)
    if (url.origin !== expectedOrigin || url.protocol !== 'http:'
      || url.username !== '' || url.password !== ''
      || !isLoopbackHostname(url.hostname)) return undefined
    return url
  } catch {
    return undefined
  }
}

function exactHeaderOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    return url.origin === value ? value : undefined
  } catch {
    return undefined
  }
}

function referrerOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

/**
 * Require the actual socket and Host to stay on the configured loopback origin.
 * A mutating request must carry the exact Origin. A read-only browser GET may
 * use the standard same-origin fetch metadata plus its same-origin referrer,
 * because browsers commonly omit Origin on same-origin GET requests.
 * A WebSocket upgrade is treated as mutating: it must carry the exact Origin.
 */
export function isSameOriginLoopbackRequest(
  req: IncomingMessage,
  expectedOrigin: string,
  mutating: boolean,
): boolean {
  const expected = expectedLoopbackOrigin(expectedOrigin)
  if (expected === undefined || !isLoopbackAddress(req.socket.remoteAddress)) return false
  if (req.headers.host?.toLowerCase() !== expected.host.toLowerCase()) return false
  if (exactHeaderOrigin(req.headers.origin) === expected.origin) {
    return req.headers['sec-fetch-site'] === undefined || req.headers['sec-fetch-site'] === 'same-origin'
  }
  if (mutating) return false
  return req.headers['sec-fetch-site'] === 'same-origin'
    && referrerOrigin(req.headers.referer) === expected.origin
}

/** True when the request declares a JSON body (`application/json`, any parameters). */
export function isJsonRequest(req: IncomingMessage): boolean {
  return req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

/**
 * Read a JSON body of at most `maxBytes`.
 * @throws BodyTooLargeError when the body (declared or actual) exceeds the cap.
 * @throws SyntaxError for a malformed length or malformed JSON.
 */
export async function readJsonBody(req: IncomingMessage, maxBytes: number = DEFAULT_MAX_BODY_BYTES): Promise<unknown> {
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new SyntaxError('invalid content length')
    if (Number(declaredLength) > maxBytes) throw new BodyTooLargeError()
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > maxBytes) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** Returned by {@link parseJsonPostBody} after it has already answered the request with an error. */
export const INVALID_BODY = Symbol('invalid body')

/**
 * Read a POST body that must be JSON. On a wrong content type (415), an oversized body (413) or malformed JSON
 * (400) it answers the request itself and returns {@link INVALID_BODY}; the caller just stops.
 */
export async function parseJsonPostBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown | typeof INVALID_BODY> {
  if (!isJsonRequest(req)) {
    finishJson(res, 415, error('content type must be application/json'))
    return INVALID_BODY
  }
  try {
    return await readJsonBody(req, maxBytes)
  } catch (cause) {
    const tooLarge = cause instanceof BodyTooLargeError
    finishJson(res, tooLarge ? 413 : 400, error(tooLarge ? 'request body is too large' : 'invalid JSON request'))
    return INVALID_BODY
  }
}
