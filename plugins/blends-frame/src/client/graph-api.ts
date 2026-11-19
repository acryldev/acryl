/** The browser's side of the Host's plugin graph routes. */

import { FRAME_GRAPH_EVENTS_PATH, FRAME_GRAPH_PATH, parseGraphEvents, parseGraphView, type GraphEventsAnswer, type GraphView } from '../graph-contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface GraphApi {
  /** The Host's graph now, and the number of its newest fiber event. */
  read(): Promise<GraphView>
  /** The fiber events after `after`: answered when there are some, or empty after the Host waited a while. Rejects when `signal` aborts. */
  events(after: number, signal?: AbortSignal): Promise<GraphEventsAnswer>
}

async function errorOf(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    // Not JSON: the status says it.
  }
  return `the request failed (HTTP ${String(response.status)})`
}

export function createGraphApi(fetcher: FetchLike = (input, init) => fetch(input, init)): GraphApi {
  return {
    async read() {
      const response = await fetcher(FRAME_GRAPH_PATH, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(await errorOf(response))
      return parseGraphView(await response.json())
    },
    async events(after, signal) {
      const response = await fetcher(`${FRAME_GRAPH_EVENTS_PATH}?after=${String(after)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        ...(signal === undefined ? {} : { signal }),
      })
      if (!response.ok) throw new Error(await errorOf(response))
      return parseGraphEvents(await response.json())
    },
  }
}
