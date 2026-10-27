// @vitest-environment jsdom
/** The page's end of the channel: heartbeat, reconnect with the same window id, and answers posted for each call. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageChannel, type ChannelSource } from '../../src/page/channel.ts'
import { UiDriver } from '../../src/page/driver/driver.ts'

class FakeSource implements ChannelSource {
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  closed = false
  readonly url: string
  constructor(url: string) { this.url = url }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data = ''): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent)
  }
  close(): void { this.closed = true; this.readyState = 2 }
}

let now = 0
let sources: FakeSource[] = []
let posts: Array<{ url: string; body: unknown }> = []

function channel(driver = new UiDriver({ document: () => document })): PageChannel {
  return new PageChannel(driver, {
    windowId: 'w-1',
    focused: () => true,
    base: '/api/acryl-door',
    createSource: (url) => { const source = new FakeSource(url); sources.push(source); return source },
    post: async (url, body) => { posts.push({ url, body: JSON.parse(body) }) },
    silenceMs: 300,
    now: () => now,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  now = 0
  sources = []
  posts = []
  document.body.innerHTML = '<button type="button">Go</button>'
})
afterEach(() => { vi.useRealTimers() })

describe('PageChannel', () => {
  it('opens the stream with its window id and focus, and posts each call\'s answer naming the window', async () => {
    const page = channel()
    page.connect()
    expect(sources[0]?.url).toBe('/api/acryl-door/channel?window=w-1&focused=1')
    sources[0]?.emit('call', JSON.stringify({ t: 'call', id: 7, request: { op: 'snapshot' } }))
    await vi.waitFor(() => { expect(posts).toHaveLength(1) })
    expect(posts[0]).toMatchObject({ url: '/api/acryl-door/channel/answer', body: { window: 'w-1', message: { t: 'result', id: 7 } } })
    page.dispose()
  })

  it('drops a stream that is silent past the heartbeat and opens a new one with the same window id; a ping keeps it', () => {
    const page = channel()
    page.connect()
    now = 200
    vi.advanceTimersByTime(200)
    sources[0]?.emit('ping')
    now = 400
    vi.advanceTimersByTime(200)
    expect(sources).toHaveLength(1)
    // Silent from 200 to past 500: dropped, then reopened after the backoff.
    now = 600
    vi.advanceTimersByTime(200)
    expect(sources[0]?.closed).toBe(true)
    vi.advanceTimersByTime(600)
    expect(sources).toHaveLength(2)
    expect(sources[1]?.url).toContain('window=w-1')
    page.dispose()
  })

  it('starts over when the EventSource gives up (closed after an error), and stops for good on dispose', () => {
    const page = channel()
    page.connect()
    const first = sources[0] as FakeSource
    first.readyState = 2
    first.onerror?.(new Event('error'))
    vi.advanceTimersByTime(600)
    expect(sources).toHaveLength(2)
    page.dispose()
    expect(sources[1]?.closed).toBe(true)
    now = 10_000
    vi.advanceTimersByTime(10_000)
    expect(sources).toHaveLength(2)
  })

  it('lets the EventSource retry by itself while it is still connecting', () => {
    const page = channel()
    page.connect()
    const first = sources[0] as FakeSource
    first.readyState = 0
    first.onerror?.(new Event('error'))
    vi.advanceTimersByTime(600)
    expect(sources).toHaveLength(1)
    expect(first.closed).toBe(false)
    page.dispose()
  })

  it('posts a focus change', async () => {
    const page = channel()
    page.connect()
    page.reportFocus(false)
    await vi.waitFor(() => { expect(posts).toHaveLength(1) })
    expect(posts[0]?.body).toEqual({ window: 'w-1', message: { t: 'focus', focused: false } })
    page.dispose()
  })
})
