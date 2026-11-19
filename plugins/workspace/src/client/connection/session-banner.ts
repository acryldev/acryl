/**
 * The frame's session banner: what the page shows when its browser session has ended.
 *
 * DSH's connection controller retries forever and reports `connecting`; if the browser lost the cookie that admits its requests, every retry answers 401 and
 * the frame would show "Reconnecting..." indefinitely with no way to say why. This watches the connection's own recovery state and, while it is not
 * connected, polls one cheap same-origin endpoint that goes through the same admission (the workspace's own routes sit on a longer router prefix and are
 * not behind the browser session, so they cannot answer this). A 401 that holds for the configured confirmations means the session is gone: the banner
 * says so and names the command that prints a way back in - `npx acrylblends open` - instead of spinning. Any admitted answer (200, 400, 404, 500) means
 * the session is alive and the banner stays quiet; a network failure means the host itself is not answering, which is the retry's business.
 */
import type { Context } from '@deepseek-ai/cordis'

/** What the banner renders. */
export type FrameSessionState = 'live' | 'waiting' | 'ended'

/** The message when the session is gone: the command is the recovery, so it is named exactly. */
export const FRAME_SESSION_ENDED_MESSAGE =
  "This frame's session ended. Open the address the terminal printed, or run `npx acrylblends open` in the app folder and open the address it prints."

/** The part of DSH's client connection service this needs. */
export interface ConnectionStateSource {
  getSnapshot(): string | undefined
  subscribe(listener: () => void): () => void
}

export interface FrameSessionBannerOptions {
  /** DSH's client connection service; absent in a composition without one (the banner then never shows). */
  readonly connection: ConnectionStateSource | undefined
  /** One admitted request's status: any answer but 401 means the session is alive. Rejecting means the host did not answer. */
  readonly probe: (signal: AbortSignal) => Promise<number>
  /** How often to poll while the connection is not up. */
  readonly everyMs?: number
  /** Consecutive 401s before the banner shows (a single 401 during a reconnect race is not a verdict). */
  readonly confirmations?: number
}

export interface FrameSessionBanner {
  getSnapshot(): FrameSessionState
  subscribe(listener: () => void): () => void
  /** Stop the watcher and any pending poll; the banner disappears. */
  dispose(): void
}

const DEFAULT_EVERY_MS = 3000
const DEFAULT_CONFIRMATIONS = 2

/**
 * Start the watcher. It subscribes to the connection state and polls only while that state is not `connected`; a 401 answers the question, a 200 (or any
 * admitted status) answers it the other way, and the banner appears only after the configured number of consecutive 401s.
 */
export function startFrameSessionBanner(options: FrameSessionBannerOptions): FrameSessionBanner {
  const everyMs = options.everyMs ?? DEFAULT_EVERY_MS
  const confirmations = Math.max(1, options.confirmations ?? DEFAULT_CONFIRMATIONS)
  const listeners = new Set<() => void>()
  let state: FrameSessionState = 'live'
  let unconfirmed = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let disposed = false

  const publish = (next: FrameSessionState): void => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  const stopPolling = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = undefined
  }
  const schedule = (): void => {
    if (disposed || timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      void poll()
    }, everyMs)
  }
  const poll = async (): Promise<void> => {
    if (disposed) return
    controller = new AbortController()
    const signal = controller.signal
    try {
      const status = await options.probe(signal)
      if (disposed) return
      if (status === 401) {
        unconfirmed += 1
        if (unconfirmed >= confirmations) {
          // The session is gone: the retry loop cannot recover it, and the person needs the address back.
          publish('ended')
          return
        }
        publish('waiting')
        schedule()
        return
      }
      // Any admitted answer (whatever the endpoint made of the request) proves the session.
      unconfirmed = 0
      publish(state === 'ended' ? 'live' : state)
      schedule()
    } catch {
      // The host did not answer at all: that is the connection's own retry, not a lost session.
      if (!disposed) schedule()
    }
  }
  const onConnectionState = (): void => {
    if (disposed) return
    const connectionState = options.connection?.getSnapshot()
    if (connectionState === 'connected') {
      stopPolling()
      unconfirmed = 0
      publish('live')
      return
    }
    // `connecting`, `disconnected` or not yet reported: ask the admitted endpoint whether the session itself survived.
    publish(state === 'ended' ? 'ended' : 'waiting')
    schedule()
  }

  if (options.connection !== undefined) {
    const unsubscribe = options.connection.subscribe(onConnectionState)
    onConnectionState()
    return {
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      dispose: () => {
        disposed = true
        unsubscribe()
        stopPolling()
        listeners.clear()
      },
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      stopPolling()
      listeners.clear()
    },
  }
}

/** The `ctx.connection` shape this module reads, for a composition that provides one. */
export interface FrameConnectionService {
  readonly state?: ConnectionStateSource
}

/** `startFrameSessionBanner` from a client context: undefined when the composition has no connection service to watch. */
export function frameSessionBannerFrom(
  ctx: Context,
  probe: (signal: AbortSignal) => Promise<number>,
): FrameSessionBanner {
  const connection = (ctx.get as (name: string) => FrameConnectionService | undefined)('connection')
  return startFrameSessionBanner({ connection: connection?.state, probe })
}

/** The endpoint the poll asks: a small Remote the gateway answers, behind the connection's own admission (the `/api` route). Any status is an answer. */
export const FRAME_SESSION_PROBE_PATH = '/api/settings/describe'

/** One admitted request; its status is the answer (401 means the browser session is gone). */
export async function probeAdmittedSession(
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const response = await fetchImpl(FRAME_SESSION_PROBE_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{}',
    signal,
  })
  return response.status
}
