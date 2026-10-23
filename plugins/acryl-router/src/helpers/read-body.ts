import { HttpError } from '../http-error.ts'
import { BODY_LIMIT_KEY } from '../middleware/body-limit.ts'
import type { RouteContext } from '../types.ts'

export interface ReadBodyOptions {
  /** The most bytes to accept. Defaults to the `bodyLimit` middleware's limit when it ran, otherwise 1 MiB. */
  readonly maxBytes?: number
}

const DEFAULT_MAX_BYTES = 1024 * 1024

/**
 * Read the request body as bytes, counting as it streams, and stop at the limit (a 413 `HttpError`). Stops at once when the request is aborted.
 * A request with no body gives an empty array.
 */
export async function readBytes(c: RouteContext, options: ReadBodyOptions = {}): Promise<Uint8Array> {
  const limit = options.maxBytes ?? c.get<number>(BODY_LIMIT_KEY) ?? DEFAULT_MAX_BYTES
  c.signal.throwIfAborted()
  const reader = c.req.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const onAbort = (): void => { void reader.cancel(c.signal.reason).catch(() => undefined) }
  c.signal.addEventListener('abort', onAbort, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => undefined)
        throw new HttpError(413, { message: 'payload too large' })
      }
      chunks.push(value)
    }
  } finally {
    c.signal.removeEventListener('abort', onAbort)
  }
  c.signal.throwIfAborted()
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

/** The body as UTF-8 text, within the limit. */
export async function readText(c: RouteContext, options?: ReadBodyOptions): Promise<string> {
  return new TextDecoder().decode(await readBytes(c, options))
}

/** The body parsed as JSON, within the limit. Bad JSON is a 400 `HttpError`. */
export async function readJson(c: RouteContext, options?: ReadBodyOptions): Promise<unknown> {
  const text = await readText(c, options)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError(400, { message: 'invalid json' })
  }
}
