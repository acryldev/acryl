// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PtyStream, type PtyStreamState, type StreamSocket } from '../../src/client/terminal/pty-stream.ts'

class FakeSocket implements StreamSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 0
  readonly sent: unknown[] = []
  closed = false
  constructor(readonly url: string) {}
  send(data: string): void { this.sent.push(JSON.parse(data)) }
  close(): void { this.closed = true }
  open(): void { this.readyState = 1; this.onopen?.(new Event('open')) }
  deliver(message: object): void { this.raw(JSON.stringify(message)) }
  raw(text: string): void { this.onmessage?.(new MessageEvent('message', { data: text })) }
  drop(code = 1006): void { this.readyState = 3; this.onclose?.(new CloseEvent('close', { code })) }
}

let sockets: FakeSocket[]
let outputs: Array<[string, boolean]>
let states: PtyStreamState[]
let exits: Array<[number | null, string | null]>

function make(): PtyStream {
  return new PtyStream('pty_1', {
    output: (data, replace) => { outputs.push([data, replace]) },
    state: (state) => { states.push(state) },
    exit: (code, error) => { exits.push([code, error]) },
  }, (url) => { const s = new FakeSocket(url); sockets.push(s); return s }, (id, cursor) => `ws://x/stream?id=${id}&since=${String(cursor)}`)
}

beforeEach(() => { vi.useFakeTimers(); sockets = []; outputs = []; states = []; exits = [] })
afterEach(() => { vi.useRealTimers() })

describe('PtyStream', () => {
  it('connects from cursor 0, shows output and remembers the cursor', () => {
    const stream = make()
    stream.connect()
    expect(sockets[0]?.url).toBe('ws://x/stream?id=pty_1&since=0')
    sockets[0]?.open()
    sockets[0]?.deliver({ t: 'out', data: 'hello', cursor: 5, replace: false })
    expect(outputs).toEqual([['hello', false]])
    expect(states).toEqual(['connecting', 'live'])
  })

  it('sends input in order and the size first after connecting', () => {
    const stream = make()
    stream.connect()
    stream.resize(100, 30)
    stream.input('a')
    stream.input('b')
    sockets[0]?.open()
    expect(sockets[0]?.sent).toEqual([{ t: 'resize', cols: 100, rows: 30 }, { t: 'in', data: 'ab' }])
    stream.input('c')
    expect(sockets[0]?.sent.at(-1)).toEqual({ t: 'in', data: 'c' })
  })

  it('reconnects with backoff and resumes from the cursor it reached', () => {
    const stream = make()
    stream.connect()
    sockets[0]?.open()
    sockets[0]?.deliver({ t: 'out', data: 'x', cursor: 42, replace: false })
    sockets[0]?.drop()
    expect(states.at(-1)).toBe('reconnecting')
    vi.advanceTimersByTime(250)
    expect(sockets[1]?.url).toBe('ws://x/stream?id=pty_1&since=42')
    sockets[1]?.drop()
    vi.advanceTimersByTime(250)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(250)
    expect(sockets).toHaveLength(3)
  })

  it('holds input typed while offline and sends it after reconnecting', () => {
    const stream = make()
    stream.connect()
    sockets[0]?.open()
    sockets[0]?.drop()
    stream.input('ls')
    vi.advanceTimersByTime(250)
    sockets[1]?.open()
    expect(sockets[1]?.sent).toEqual([{ t: 'in', data: 'ls' }])
  })

  it('stops for good after an exit or an unknown session', () => {
    const stream = make()
    stream.connect()
    sockets[0]?.open()
    sockets[0]?.deliver({ t: 'exit', exitCode: 2, error: null })
    expect(exits).toEqual([[2, null]])
    sockets[0]?.drop()
    vi.advanceTimersByTime(10_000)
    expect(sockets).toHaveLength(1)

    states.length = 0
    const other = make()
    other.connect()
    sockets[1]?.drop(4404)
    vi.advanceTimersByTime(10_000)
    expect(states.at(-1)).toBe('lost')
    expect(sockets).toHaveLength(2)
  })

  it('ignores malformed frames and closes on dispose without reconnecting', () => {
    const stream = make()
    stream.connect()
    sockets[0]?.open()
    sockets[0]?.raw('not json')
    sockets[0]?.deliver({ t: 'bogus' })
    expect(outputs).toEqual([])
    stream.dispose()
    expect(sockets[0]?.closed).toBe(true)
    vi.advanceTimersByTime(10_000)
    expect(sockets).toHaveLength(1)
  })
})
