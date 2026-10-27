/** A route app called as the Host's Web adapter calls it: the page's own request by default, with the socket's peer and local port. */

import type { Acryl } from 'acrylblends'

export const PORT = 43120
export const ORIGIN = `http://127.0.0.1:${String(PORT)}`

export interface CallOptions {
  readonly method?: string
  /** Replaces a default header; `undefined` removes it. */
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly body?: string
  readonly remoteAddress?: string
}

export async function call(app: Acryl, path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers()
  for (const [key, value] of Object.entries({ host: `127.0.0.1:${String(PORT)}`, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...options.headers })) {
    if (value !== undefined) headers.set(key, value)
  }
  const request = new Request(`${ORIGIN}${path}`, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: options.body }) })
  return await app.fetch(request, { connection: { remoteAddress: options.remoteAddress ?? '127.0.0.1', localPort: PORT } })
}

export function post(app: Acryl, path: string, value: unknown, options: CallOptions = {}): Promise<Response> {
  return call(app, path, { ...options, method: 'POST', body: JSON.stringify(value), headers: { 'content-type': 'application/json', ...options.headers } })
}
