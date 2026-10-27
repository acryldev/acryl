/**
 * Call Desktop's route apps the way the real HTTP adapter does: a Web `Request` plus the connection facts it takes from the socket (the
 * peer address and the real local port), composed as the plugin composes them (`desktopApi`). By default the request is the renderer's
 * own: loopback peer, the Host's `Host`, its exact `Origin` and same-origin fetch metadata; a test overrides one fact to see a refusal.
 */

import type { Acryl } from 'acrylblends'
import { desktopApi } from '../../src/api/http.ts'

export const PORT = 43120
export const ORIGIN = `http://127.0.0.1:${String(PORT)}`

export interface CallOptions {
  readonly method?: string
  /** Replaces a default header; `undefined` removes it. */
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly body?: BodyInit
  readonly remoteAddress?: string
}

export function call(app: Acryl, path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers()
  for (const [key, value] of Object.entries({ host: `127.0.0.1:${String(PORT)}`, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...options.headers })) {
    if (value !== undefined) headers.set(key, value)
  }
  const streamed = options.body instanceof ReadableStream
  const request = new Request(`${ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(streamed ? { duplex: 'half' } : {}),
  } as RequestInit)
  return Promise.resolve(desktopApi(app).fetch(request, { connection: { remoteAddress: options.remoteAddress ?? '127.0.0.1', localPort: PORT } }))
}

/** A POST with a JSON body, as the renderer sends it. */
export function postJson(app: Acryl, path: string, value: unknown, options: CallOptions = {}): Promise<Response> {
  return call(app, path, { ...options, method: 'POST', body: JSON.stringify(value), headers: { 'content-type': 'application/json; charset=utf-8', ...options.headers } })
}
