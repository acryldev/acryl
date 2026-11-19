/**
 * The browser module served at /api/state/client.js, run here against a hand-made WebSocket and EventSource: one socket per page, the frames in both directions, the retry with a growing
 * delay, the watchdog, the event-stream fallback with its single warning, and the page leaving and coming back. The same module runs in real Chrome in the repository's gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_SOURCE } from '../src/client-source.ts'

const BASE = 'http://127.0.0.1:4000/api/state/client.js'

class FakeSocket {
  static all: FakeSocket[] = []
  static refuse = false
  readyState = 0
  sent: unknown[] = []
  closed: Array<[number | undefined, string | undefined]> = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly url: string
  constructor(url: string) {
    if (FakeSocket.refuse) throw new Error('no WebSocket here')
    this.url = url
    FakeSocket.all.push(this)
  }
  send(text: string): void { this.sent.push(JSON.parse(text)) }
  close(code?: number, reason?: string): void { this.closed.push([code, reason]); this.readyState = 3 }
  // The server side of the conversation.
  open(): void { this.readyState = 1; this.onopen?.() }
  say(frame: object): void { this.onmessage?.({ data: JSON.stringify(frame) }) }
  drop(): void { this.readyState = 3; this.onclose?.() }
}

class FakeEventSource {
  static all: FakeEventSource[] = []
  readyState = 1
  onerror: (() => void) | null = null
  closed = false
  private readonly listeners = new Map<string, Array<(event: { data: string }) => void>>()
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.all.push(this)
  }
  addEventListener(type: string, listener: (event: { data: string }) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  close(): void { this.closed = true; this.readyState = 2 }
  say(type: string, data: string): void { for (const listener of this.listeners.get(type) ?? []) listener({ data }) }
}

const page = new Map<string, () => void>()
let counter = 0
const globals = globalThis as unknown as Record<string, unknown>
const saved = { WebSocket: globals.WebSocket, EventSource: globals.EventSource, addEventListener: globals.addEventListener }

async function load(): Promise<{ watch: (key: string, onValue: (value: unknown) => void, onError?: (error: Error) => void) => () => void }> {
  counter += 1
  const source = `${CLIENT_SOURCE.replace('import.meta.url', JSON.stringify(BASE))}\n// instance ${String(counter)}`
  return await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.all = []
  FakeSocket.refuse = false
  FakeEventSource.all = []
  page.clear()
  globals.WebSocket = FakeSocket
  globals.EventSource = FakeEventSource
  globals.addEventListener = (type: string, listener: () => void) => { page.set(type, listener) }
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const [name, value] of Object.entries(saved)) globals[name] = value
})

describe('watch', () => {
  it('opens one socket for every key of the page, on the ws route next to the module, and subscribes after it opens', async () => {
    const { watch } = await load()
    watch('app.count', () => undefined)
    watch('app.title', () => undefined)
    expect(FakeSocket.all).toHaveLength(1)
    const socket = FakeSocket.all[0]!
    expect(socket.url).toBe('ws://127.0.0.1:4000/api/state/ws')
    socket.open()
    expect(socket.sent).toEqual([{ t: 'sub', key: 'app.count' }, { t: 'sub', key: 'app.title' }])
    watch('app.late', () => undefined)
    expect(socket.sent.at(-1)).toEqual({ t: 'sub', key: 'app.late' })
  })

  it('delivers the JSON value as sent (a string stays a string) and skips a repeat of the same value', async () => {
    const { watch } = await load()
    const seen: unknown[] = []
    watch('app.title', value => seen.push(value))
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.say({ key: 'app.title', value: '12' })
    socket.say({ key: 'app.title', value: '12' })
    socket.say({ key: 'app.title', value: { a: [1] } })
    socket.say({ key: 'app.other', value: 1 })
    expect(seen).toEqual(['12', { a: [1] }])
  })

  it('gives a second watcher of a key the value it already has, and subscribes the key once', async () => {
    const { watch } = await load()
    watch('app.count', () => undefined)
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.say({ key: 'app.count', value: 4 })
    const second: unknown[] = []
    watch('app.count', value => second.push(value))
    expect(second).toEqual([])
    await Promise.resolve()
    expect(second).toEqual([4])
    expect(socket.sent.filter(frame => (frame as { t: string }).t === 'sub')).toHaveLength(1)
  })

  it('unsubscribes the key with its last watcher and closes the socket with the last key', async () => {
    const { watch } = await load()
    const stopA = watch('app.count', () => undefined)
    const stopB = watch('app.count', () => undefined)
    const stopC = watch('app.title', () => undefined)
    const socket = FakeSocket.all[0]!
    socket.open()
    stopA()
    stopA()
    expect(socket.sent.filter(frame => (frame as { t: string }).t === 'unsub')).toEqual([])
    stopB()
    expect(socket.sent.at(-1)).toEqual({ t: 'unsub', key: 'app.count' })
    stopC()
    expect(socket.closed).toEqual([[1000, 'page left']])
  })

  it('keeps delivering to the others when one watcher throws', async () => {
    const { watch } = await load()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const seen: unknown[] = []
    watch('app.count', () => { throw new Error('boom') })
    watch('app.count', value => seen.push(value))
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.say({ key: 'app.count', value: 1 })
    expect(seen).toEqual([1])
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('tells onError of a key that does not exist, or warns once when nothing listens for errors', async () => {
    const { watch } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const told: string[] = []
    watch('app.gone', () => undefined, error => told.push(error.message))
    watch('app.also', () => undefined)
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.say({ key: 'app.gone', error: 'no such state' })
    socket.say({ key: 'app.also', error: 'no such state' })
    socket.say({ key: 'app.also', error: 'no such state' })
    expect(told).toEqual(['no such state'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('rejects a bad key or callback at once', async () => {
    const { watch } = await load()
    expect(() => watch('', () => undefined)).toThrow(TypeError)
    expect(() => watch('app.count', undefined as never)).toThrow(TypeError)
    expect(FakeSocket.all).toHaveLength(0)
  })
})

describe('when the socket goes away', () => {
  it('tries again after a growing delay and subscribes every key again', async () => {
    const { watch } = await load()
    const seen: unknown[] = []
    watch('app.count', value => seen.push(value))
    watch('app.title', () => undefined)
    FakeSocket.all[0]!.open()
    FakeSocket.all[0]!.say({ key: 'app.count', value: 1 })
    FakeSocket.all[0]!.drop()
    expect(FakeSocket.all).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(249)
    expect(FakeSocket.all).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeSocket.all).toHaveLength(2)
    // It fails again before opening: the next delay is twice as long.
    FakeSocket.all[1]!.drop()
    await vi.advanceTimersByTimeAsync(499)
    expect(FakeSocket.all).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeSocket.all).toHaveLength(3)
    const third = FakeSocket.all[2]!
    third.open()
    expect(third.sent).toEqual([{ t: 'sub', key: 'app.count' }, { t: 'sub', key: 'app.title' }])
    // The server tells the current value again after a restart: the same value is not delivered twice, a changed one is.
    third.say({ key: 'app.count', value: 1 })
    third.say({ key: 'app.count', value: 2 })
    expect(seen).toEqual([1, 2])
  })

  it('does not wait longer than ten seconds', async () => {
    const { watch } = await load()
    watch('app.count', () => undefined)
    FakeSocket.all[0]!.open()
    for (let round = 0; round < 8; round += 1) {
      FakeSocket.all.at(-1)!.drop()
      await vi.advanceTimersByTimeAsync(10_000)
    }
    const before = FakeSocket.all.length
    FakeSocket.all.at(-1)!.drop()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(FakeSocket.all).toHaveLength(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeSocket.all).toHaveLength(before + 1)
  })

  it('treats 45 seconds without a frame as a dead socket, and a ping as proof of life', async () => {
    const { watch } = await load()
    watch('app.count', () => undefined)
    const socket = FakeSocket.all[0]!
    socket.open()
    await vi.advanceTimersByTimeAsync(40_000)
    socket.say({ t: 'ping' })
    await vi.advanceTimersByTimeAsync(40_000)
    expect(FakeSocket.all).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5_001)
    expect(socket.closed).toEqual([[1000, 'page left']])
    await vi.advanceTimersByTimeAsync(250)
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('lets go of its connections when the page is hidden for good and opens them again when it comes back', async () => {
    const { watch } = await load()
    watch('app.count', () => undefined)
    const socket = FakeSocket.all[0]!
    socket.open()
    page.get('pagehide')!()
    expect(socket.closed).toEqual([[1000, 'page left']])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeSocket.all).toHaveLength(1)
    page.get('pageshow')!()
    expect(FakeSocket.all).toHaveLength(2)
    FakeSocket.all[1]!.open()
    expect(FakeSocket.all[1]!.sent).toEqual([{ t: 'sub', key: 'app.count' }])
  })
})

describe('where the WebSocket cannot open', () => {
  it('follows each key by its event stream, with one warning', async () => {
    const { watch } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const seen: unknown[] = []
    watch('app.count', value => seen.push(value))
    watch('app.title', () => undefined)
    FakeSocket.all[0]!.drop()
    expect(FakeEventSource.all.map(source => source.url)).toEqual([
      'http://127.0.0.1:4000/api/state/app.count/events?json=1',
      'http://127.0.0.1:4000/api/state/app.title/events?json=1',
    ])
    FakeEventSource.all[0]!.say('value', '12')
    FakeEventSource.all[0]!.say('value', '"12"')
    expect(seen).toEqual([12, '12'])
    watch('app.late', () => undefined)
    expect(FakeEventSource.all.at(-1)!.url).toBe('http://127.0.0.1:4000/api/state/app.late/events?json=1')
    expect(FakeSocket.all).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('falls back at once when the browser throws on `new WebSocket`', async () => {
    FakeSocket.refuse = true
    const { watch } = await load()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    watch('app.count', () => undefined)
    expect(FakeEventSource.all).toHaveLength(1)
  })

  it('reports a refused stream (no such key) and closes a stream with its last watcher', async () => {
    const { watch } = await load()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const told: string[] = []
    const stop = watch('app.gone', () => undefined, error => told.push(error.message))
    FakeSocket.all[0]!.drop()
    const source = FakeEventSource.all[0]!
    source.readyState = 2
    source.onerror?.()
    expect(told).toHaveLength(1)
    stop()
    const other = watch('app.count', () => undefined)
    other()
    expect(FakeEventSource.all.at(-1)!.closed).toBe(true)
  })

  it('closes the streams when the page is hidden and opens them again when it returns', async () => {
    const { watch } = await load()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    watch('app.count', () => undefined)
    FakeSocket.all[0]!.drop()
    page.get('pagehide')!()
    expect(FakeEventSource.all[0]!.closed).toBe(true)
    page.get('pageshow')!()
    expect(FakeEventSource.all).toHaveLength(2)
    expect(FakeEventSource.all[1]!.closed).toBe(false)
  })
})
