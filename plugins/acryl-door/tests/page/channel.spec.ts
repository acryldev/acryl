// @vitest-environment jsdom
/** The page's end of the channel: heartbeat, reconnect with the same window id, and answers posted for each call. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageChannel, type ChannelSource } from '../../src/page/channel.ts'
import { type SocketLike, socketSource } from '../../src/page/socket-source.ts'
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

function channel(driver = new UiDriver({ document: () => document }), onRun?: (running: boolean) => void): PageChannel {
  return new PageChannel(driver, {
    ...(onRun === undefined ? {} : { onRun }),
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
  it('tells the page when a run asked for from its panel starts and ends, and that it stopped hearing when the stream is lost', () => {
    const told: boolean[] = []
    const page = channel(undefined, running => told.push(running))
    page.connect()
    sources[0]?.emit('run', '1')
    sources[0]?.emit('run', '0')
    sources[0]?.emit('run', '1')
    expect(told).toEqual([true, false, true])
    // The stream goes (the page is hidden for good): a run that ends meanwhile cannot be heard, so the bar does not stay up on its own.
    page.suspend()
    expect(told.at(-1)).toBe(false)
    page.dispose()
  })

  it('opens the stream with its window id and focus, and posts each call\'s answer naming the window', async () => {
    const page = channel()
    page.connect()
    expect(sources[0]?.url).toBe('/api/acryl-door/channel?window=w-1&focused=1')
    sources[0]?.emit('call', JSON.stringify({ t: 'call', id: 7, request: { op: 'snapshot' } }))
    await vi.waitFor(() => { expect(posts).toHaveLength(2) })
    // The page says it heard the call before it does anything, then answers it.
    expect(posts[0]).toMatchObject({ url: '/api/acryl-door/channel/answer', body: { window: 'w-1', message: { t: 'ack', id: 7 } } })
    expect(posts[1]).toMatchObject({ url: '/api/acryl-door/channel/answer', body: { window: 'w-1', message: { t: 'result', id: 7 } } })
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

  it('lets go of its stream when the page is left (a browser may keep the page, and six kept streams hold up every request of the live page) and opens it again, with the same window id, when the page is restored', () => {
    const page = channel()
    page.connect()
    expect(sources).toHaveLength(1)
    page.suspend()
    expect(sources[0]?.closed).toBe(true)
    // No reconnect on its own: a suspended page stays quiet.
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(1)
    page.resume()
    expect(sources).toHaveLength(2)
    expect(sources[1]?.url).toBe('/api/acryl-door/channel?window=w-1&focused=1')
    page.dispose()
    page.resume()
    expect(sources).toHaveLength(2)
  })

  describe('over a WebSocket', () => {
    class FakeSocket implements SocketLike {
      readyState = 0
      onopen: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      onclose: ((event: CloseEvent) => void) | null = null
      readonly sent: string[] = []
      readonly url: string
      constructor(url: string) { this.url = url }
      send(data: string): void { this.sent.push(data) }
      close(): void { this.readyState = 3 }
      /** The server accepted the upgrade and sent a frame. */
      frame(e: string, d?: string): void {
        this.readyState = 1
        this.onmessage?.({ data: JSON.stringify(d === undefined ? { e } : { e, d }) } as MessageEvent)
      }
      /** The upgrade was refused or the socket died. */
      fail(): void { this.readyState = 3; this.onerror?.(new Event('error')) }
    }
    let sockets: FakeSocket[] = []
    let warnings: string[] = []
    const socketChannel = (options: { transport?: 'auto' | 'stream' } = {}): PageChannel =>
      new PageChannel(new UiDriver({ document: () => document }), {
        windowId: 'w-1',
        focused: () => true,
        base: '/api/acryl-door',
        createSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socketSource(socket) },
        createSource: (url) => { const source = new FakeSource(url); sources.push(source); return source },
        post: async (url, body) => { posts.push({ url, body: JSON.parse(body) }) },
        warn: (message) => { warnings.push(message) },
        silenceMs: 300,
        now: () => now,
        ...options,
      })
    beforeEach(() => { sockets = []; warnings = [] })

    it('opens the socket first, runs each call, and sends the acknowledgement and the answer up the socket, not as requests', async () => {
      const page = socketChannel()
      page.connect()
      expect(sockets).toHaveLength(1)
      expect(sources).toHaveLength(0)
      expect(sockets[0]?.url).toMatch(/\/api\/acryl-door\/channel\/ws\?window=w-1&focused=1$/u)
      sockets[0]?.frame('ready')
      sockets[0]?.frame('call', JSON.stringify({ t: 'call', id: 7, request: { op: 'snapshot' } }))
      await vi.waitFor(() => { expect(sockets[0]?.sent).toHaveLength(2) })
      const [ack, result] = (sockets[0]?.sent ?? []).map(text => JSON.parse(text) as { t: string; id: number })
      expect([ack?.t, ack?.id, result?.t, result?.id]).toEqual(['ack', 7, 'result', 7])
      expect(posts).toHaveLength(0)
      page.reportFocus(false)
      expect(JSON.parse(sockets[0]?.sent.at(-1) ?? '{}')).toEqual({ t: 'focus', focused: false })
      page.dispose()
    })

    it('falls back to the event stream, once and with a warning that says why, when the socket never opens; it keeps to the stream after that', () => {
      const page = socketChannel()
      page.connect()
      sockets[0]?.fail()
      expect(sources).toHaveLength(1)
      expect(sources[0]?.url).toBe('/api/acryl-door/channel?window=w-1&focused=1')
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatch(/could not open a WebSocket.*server-sent events/u)
      // The stream later fails and reopens: still the stream, no second warning, no second socket.
      sources[0]?.emit('ready')
      sources[0]!.readyState = 2
      sources[0]?.onerror?.(new Event('error'))
      vi.advanceTimersByTime(60_000)
      expect(sockets).toHaveLength(1)
      expect(warnings).toHaveLength(1)
      page.dispose()
    })

    it('reopens a socket that was working and died (a restarted server) as a socket, with the same window id, and does not fall back', () => {
      const page = socketChannel()
      page.connect()
      sockets[0]?.frame('ready')
      sockets[0]?.fail()
      vi.advanceTimersByTime(5_000)
      expect(sockets).toHaveLength(2)
      expect(sockets[1]?.url).toMatch(/window=w-1/u)
      expect(sources).toHaveLength(0)
      expect(warnings).toEqual([])
      page.dispose()
    })

    it('keeps to the event stream when told to, and lets go of the socket when the page is left', () => {
      const stream = socketChannel({ transport: 'stream' })
      stream.connect()
      expect(sockets).toHaveLength(0)
      expect(sources).toHaveLength(1)
      stream.dispose()
      const page = socketChannel()
      page.connect()
      sockets[0]?.frame('ready')
      page.suspend()
      expect(sockets[0]?.readyState).toBe(3)
      vi.advanceTimersByTime(60_000)
      expect(sockets).toHaveLength(1)
      page.resume()
      expect(sockets).toHaveLength(2)
      page.dispose()
    })
  })
})
