/** Shared loopback JSON helpers for ACRYL Workspace Host routes (PTY and git). */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Write one JSON response with the no-store, nosniff headers every Workspace route uses. */
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

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  if (address === '::1' || address === '127.0.0.1') return true
  if (address.startsWith('::ffff:')) return address.slice('::ffff:'.length).startsWith('127.')
  return address.startsWith('127.')
}

export function isSameOriginLoopbackRequest(
  req: IncomingMessage,
  expectedOrigin: string,
  mutating: boolean,
): boolean {
  let expected: URL
  try {
    expected = new URL(expectedOrigin)
  } catch {
    return false
  }
  if (expected.origin !== expectedOrigin || expected.protocol !== 'http:'
    || expected.username !== '' || expected.password !== ''
    || !isLoopbackHostname(expected.hostname)) return false
  if (!isLoopbackAddress(req.socket.remoteAddress)) return false
  if (req.headers.host?.toLowerCase() !== expected.host.toLowerCase()) return false
  let origin: string | undefined
  try {
    origin = req.headers.origin === undefined ? undefined : new URL(req.headers.origin).origin
    if (req.headers.origin !== undefined && origin !== req.headers.origin) origin = undefined
  } catch {
    origin = undefined
  }
  if (origin === expected.origin) {
    return req.headers['sec-fetch-site'] === undefined || req.headers['sec-fetch-site'] === 'same-origin'
  }
  if (mutating) return false
  try {
    return req.headers['sec-fetch-site'] === 'same-origin'
      && req.headers.referer !== undefined
      && new URL(req.headers.referer).origin === expected.origin
  } catch {
    return false
  }
}

const MAX_BODY_BYTES = 16 * 1024

/** Thrown when a request body exceeds the cap. */
export class BodyTooLargeError extends Error {}

/** Read a small JSON body, or throw. */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new SyntaxError('invalid content length')
    if (Number(declaredLength) > MAX_BODY_BYTES) throw new BodyTooLargeError()
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
