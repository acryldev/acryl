/** Same-origin browser client for agent workers. */

import { WORKERS_PATH, type WorkerRequest, type WorkerResponse } from '../../workers-contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface WorkersApi {
  /** @throws an Error with the Host's own words when the request could not be made at all; an answered refusal is returned. */
  call(request: WorkerRequest, signal?: AbortSignal): Promise<WorkerResponse>
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createWorkersApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): WorkersApi {
  return {
    async call(request, signal) {
      const response = await fetchImpl(WORKERS_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal }),
      })
      let body: unknown = null
      try { body = await response.json() } catch { body = null }
      if (typeof body === 'object' && body !== null && 'ok' in body) return body as WorkerResponse
      throw new Error(`the request failed (HTTP ${String(response.status)})`)
    },
  }
}
