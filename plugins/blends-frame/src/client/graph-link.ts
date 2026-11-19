/**
 * The graph view's link to the app: read the graph, then wait for each change, and when the app stops answering say so and start over by itself.
 *
 * Starting over means reading the graph again, not asking for "changes after the number I had": an app that was stopped and started again counts its
 * changes from the beginning, so the old number would make the view wait for changes that never come.
 */

import type { GraphEvent, GraphSnapshot } from '../graph-contract.ts'
import type { GraphApi } from './graph-api.ts'

export type Live = 'connecting' | 'live' | 'lost'

/** The sentence shown while the link is down (one place, so the view and the tests say the same). */
export const LOST_TEXT = 'Lost the connection to the app, trying again...'

export const RETRY_MS = 3000

export interface LinkEvents {
  onLive(live: Live): void
  onSnapshot(snapshot: GraphSnapshot): void
  onEvents(events: readonly GraphEvent[]): void
}

/** Wait `ms`, or less when `signal` aborts. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal.aborted) { done(); return }
    const finish = (): void => { clearTimeout(timer); signal.removeEventListener('abort', finish); done() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** Runs until `signal` aborts. `wait` is injectable for tests. */
export async function runLink(api: GraphApi, events: LinkEvents, signal: AbortSignal, wait: (ms: number, signal: AbortSignal) => Promise<void> = pause): Promise<void> {
  let after: number | undefined
  while (!signal.aborted) {
    if (after === undefined) {
      try {
        const view = await api.read()
        if (signal.aborted) return
        events.onSnapshot(view.snapshot)
        after = view.seq
        events.onLive('live')
      } catch {
        if (signal.aborted) return
        events.onLive('lost')
        await wait(RETRY_MS, signal)
      }
      continue
    }
    try {
      const answer = await api.events(after, signal)
      if (signal.aborted) return
      after = answer.seq
      events.onLive('live')
      if (answer.events.length > 0) events.onEvents(answer.events)
    } catch {
      if (signal.aborted) return
      events.onLive('lost')
      after = undefined
      await wait(RETRY_MS, signal)
    }
  }
}
