import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FRAME_SESSION_ENDED_MESSAGE,
  FRAME_SESSION_PROBE_PATH,
  probeAdmittedSession,
  startFrameSessionBanner,
} from '../../src/client/connection/session-banner.ts'

/** DSH's client connection state, driven by the test. */
function fakeConnection(initial: string | undefined) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: string | undefined) {
      state = next
      for (const listener of listeners) listener()
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

describe('the frame session banner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays quiet while the connection is up and asks nothing', async () => {
    const connection = fakeConnection('connected')
    const probe = vi.fn(async () => 200)
    const banner = startFrameSessionBanner({ connection, probe, everyMs: 10 })
    await vi.advanceTimersByTimeAsync(100)
    expect(banner.getSnapshot()).toBe('live')
    expect(probe).not.toHaveBeenCalled()
    banner.dispose()
  })

  it('asks an admitted endpoint once the connection drops, and a 401 that holds ends the session with the command named', async () => {
    const connection = fakeConnection('connected')
    let status = 200
    const probe = vi.fn(async () => status)
    const banner = startFrameSessionBanner({ connection, probe, everyMs: 100, confirmations: 2 })
    connection.set('connecting')
    await vi.advanceTimersByTimeAsync(110)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(banner.getSnapshot()).toBe('waiting')
    // One 401 is a reconnect race, not a verdict.
    status = 401
    await vi.advanceTimersByTimeAsync(110)
    expect(banner.getSnapshot()).toBe('waiting')
    await vi.advanceTimersByTimeAsync(110)
    expect(banner.getSnapshot()).toBe('ended')
    expect(FRAME_SESSION_ENDED_MESSAGE).toContain('npx acrylblends open')
    banner.dispose()
  })

  it('a session that answers anything but 401 stays quiet, and a recovered connection clears the banner', async () => {
    const connection = fakeConnection('connected')
    let status: number | (() => never) = 200
    const probe = vi.fn(async () => (typeof status === 'function' ? status() : status))
    const banner = startFrameSessionBanner({ connection, probe, everyMs: 100, confirmations: 2 })
    connection.set('connecting')
    await vi.advanceTimersByTimeAsync(110)
    // A host that is restarting answers 400/404/500 while the session is actually fine: that is not a lost session.
    status = 500
    await vi.advanceTimersByTimeAsync(110)
    expect(banner.getSnapshot()).toBe('waiting')
    // A network failure is the retry's business, not the session's.
    status = () => {
      throw new Error('offline')
    }
    await vi.advanceTimersByTimeAsync(110)
    expect(banner.getSnapshot()).toBe('waiting')
    // Once the page is up again the banner is gone (it was never shown here, and that is the point).
    connection.set('connected')
    expect(banner.getSnapshot()).toBe('live')
    banner.dispose()
  })

  it('stops polling and releases its subscription on dispose', async () => {
    const connection = fakeConnection('connected')
    const probe = vi.fn(async () => 200)
    const banner = startFrameSessionBanner({ connection, probe, everyMs: 10 })
    connection.set('disconnected')
    await vi.advanceTimersByTimeAsync(15)
    const calls = probe.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    banner.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(probe.mock.calls.length).toBe(calls)
    expect(connection.listenerCount).toBe(0)
  })

  it('shows nothing at all when the composition has no connection service', async () => {
    const probe = vi.fn(async () => 401)
    const banner = startFrameSessionBanner({ connection: undefined, probe, everyMs: 10 })
    await vi.advanceTimersByTimeAsync(100)
    expect(probe).not.toHaveBeenCalled()
    expect(banner.getSnapshot()).toBe('live')
    banner.dispose()
  })
})

describe('the admitted probe', () => {
  it('asks the small Remote with the session credentials and answers with the status', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const status = await probeAdmittedSession(new AbortController().signal, fetchImpl)
    expect(status).toBe(200)
    const [path, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] ?? [undefined, undefined]
    expect(path).toBe(FRAME_SESSION_PROBE_PATH)
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('same-origin')
  })
})
