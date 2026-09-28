/**
 * Same-origin loopback HTTP helpers, inlined (not a dependency on `acryl-loopback-http`): this extension is
 * vendored into whatever project grows from the GTD Blueprint, outside the ACRYL monorepo's own workspace
 * linking, so it can only rely on `node:` builtins and the runtime packages the engine itself guarantees
 * (`@deepseek-ai/dsh-tools`). A package this project's own workspace does not resolve for it, discovered live:
 * `acryl-agent-control` (which does depend on it) is not part of the Blank Blueprint's rows, so nothing links
 * `acryl-loopback-http` into a Blank-grown app's profile, and this plugin's routes silently returned 404 for
 * every request until this file replaced that import. Kept intentionally small and copied in spirit from that
 * package's own checks (same project, MIT).
 */

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024

export class BodyTooLargeError extends Error {}

export function finishJson(res, statusCode, value, allow) {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  if (allow !== undefined) res.setHeader('allow', allow)
  res.end(JSON.stringify(value))
}

export function error(message) {
  return { error: message }
}

function isLoopbackHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === '[::1]'
}

export function isLoopbackAddress(address) {
  if (address === undefined) return false
  if (address === '::1' || address === '127.0.0.1') return true
  if (address.startsWith('::ffff:')) return address.slice('::ffff:'.length).startsWith('127.')
  return address.startsWith('127.')
}

function expectedLoopbackOrigin(expectedOrigin) {
  try {
    const url = new URL(expectedOrigin)
    if (url.origin !== expectedOrigin || url.protocol !== 'http:' || url.username !== '' || url.password !== '' || !isLoopbackHostname(url.hostname)) return undefined
    return url
  } catch {
    return undefined
  }
}

function exactHeaderOrigin(value) {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    return url.origin === value ? value : undefined
  } catch {
    return undefined
  }
}

function referrerOrigin(value) {
  if (value === undefined) return undefined
  try { return new URL(value).origin } catch { return undefined }
}

/** A mutating request must carry the exact Origin; a read-only GET may use same-origin fetch metadata instead. */
export function isSameOriginLoopbackRequest(req, expectedOrigin, mutating) {
  const expected = expectedLoopbackOrigin(expectedOrigin)
  if (expected === undefined || !isLoopbackAddress(req.socket.remoteAddress)) return false
  if (req.headers.host?.toLowerCase() !== expected.host.toLowerCase()) return false
  if (exactHeaderOrigin(req.headers.origin) === expected.origin) {
    return req.headers['sec-fetch-site'] === undefined || req.headers['sec-fetch-site'] === 'same-origin'
  }
  if (mutating) return false
  return req.headers['sec-fetch-site'] === 'same-origin' && referrerOrigin(req.headers.referer) === expected.origin
}

export function isJsonRequest(req) {
  return req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

export async function readJsonBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new SyntaxError('invalid content length')
    if (Number(declaredLength) > maxBytes) throw new BodyTooLargeError()
  }
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export const INVALID_BODY = Symbol('invalid body')

/** Reads a POST body that must be JSON. On a bad request it answers `res` itself and returns INVALID_BODY. */
export async function parseJsonPostBody(req, res, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  if (!isJsonRequest(req)) { finishJson(res, 415, error('content type must be application/json')); return INVALID_BODY }
  try {
    return await readJsonBody(req, maxBytes)
  } catch (cause) {
    const tooLarge = cause instanceof BodyTooLargeError
    finishJson(res, tooLarge ? 413 : 400, error(tooLarge ? 'request body is too large' : 'invalid JSON request'))
    return INVALID_BODY
  }
}
