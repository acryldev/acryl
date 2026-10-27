import { describe, expect, it, vi } from 'vitest'
import { UiControlError, type ChannelToPage, type UiRequest } from '../../src/page/protocol.ts'
import { UiChannel, type PageStream } from '../../src/host/channel.ts'

function fakePage(channel: UiChannel, windowId: string, focused = true) {
  const sent: ChannelToPage[] = []
  const stream: PageStream & { closed: boolean } = { closed: false, send: (data) => { sent.push(JSON.parse(data) as ChannelToPage) }, close() { this.closed = true } }
  const end = channel.attach(windowId, focused, stream)
  return { end, sent, stream, answer: (message: Parameters<UiChannel['receive']>[1]) => { channel.receive(windowId, message) } }
}

const click: UiRequest = { op: 'click', ref: '1.1' }
const codeOf = async (promise: Promise<unknown>): Promise<string> => { try { await promise; return 'ok' } catch (cause) { return cause instanceof UiControlError ? cause.code : 'other' } }

describe('UiChannel', () => {
  it('sends a call to the page and resolves with what the page answers', async () => {
    const channel = new UiChannel()
    const page = fakePage(channel, 'w1')
    const result = channel.call(click)
    expect(page.sent).toEqual([{ t: 'call', id: 1, request: click }])
    page.answer({ t: 'result', id: 1, value: { ok: true, target: { role: 'button', name: 'Go' } } })
    expect(await result).toEqual({ ok: true, target: { role: 'button', name: 'Go' } })
  })

  it('rejects with the page’s own reason when it refuses', async () => {
    const channel = new UiChannel()
    const page = fakePage(channel, 'w1')
    const result = channel.call(click)
    page.answer({ t: 'error', id: 1, code: 'stale-ref', message: 'take a new snapshot' })
    await expect(result).rejects.toMatchObject({ code: 'stale-ref', message: 'take a new snapshot' })
  })

  it('has no page to control until one connects', async () => {
    const channel = new UiChannel()
    expect(channel.connected).toBe(false)
    expect(await codeOf(channel.call(click))).toBe('no-window')
  })

  it('drives the page the user focused last, and only that page may answer', async () => {
    const channel = new UiChannel()
    const first = fakePage(channel, 'w1')
    const second = fakePage(channel, 'w2', false)
    first.answer({ t: 'focus', focused: true })
    const pending = channel.call(click)
    expect(first.sent).toHaveLength(1)
    expect(second.sent).toHaveLength(0)
    // The other page cannot forge the answer, and neither can a window id nobody holds.
    second.answer({ t: 'result', id: 1, value: { ok: true } })
    channel.receive('w9', { t: 'result', id: 1, value: { ok: true } })
    let settled = false
    void pending.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    first.answer({ t: 'result', id: 1, value: { ok: true } })
    await expect(pending).resolves.toEqual({ ok: true })
    // Focus moves; the next call follows it.
    second.answer({ t: 'focus', focused: true })
    void channel.call(click).catch(() => {})
    expect(second.sent).toHaveLength(1)
    expect(channel.windows().map(w => w.windowId)).toEqual(['w2', 'w1'])
  })

  it('settles a call in flight as disconnected the moment its stream ends, without waiting for the timeout', async () => {
    const channel = new UiChannel()
    const page = fakePage(channel, 'w1')
    const started = Date.now()
    const pending = channel.call(click, { timeoutMs: 30_000 })
    page.end()
    expect(await codeOf(pending)).toBe('disconnected')
    expect(Date.now() - started).toBeLessThan(1000)
    expect(channel.connected).toBe(false)
  })

  it('a page that reconnects with its window id replaces the old stream: the old call settles disconnected, the next call reaches the new stream', async () => {
    const channel = new UiChannel()
    const old = fakePage(channel, 'w1')
    const pending = channel.call(click)
    const fresh = fakePage(channel, 'w1')
    expect(await codeOf(pending)).toBe('disconnected')
    expect(old.stream.closed).toBe(true)
    // The old stream ending late does not drop the new one.
    old.end()
    expect(channel.connected).toBe(true)
    const next = channel.call(click)
    expect(fresh.sent).toEqual([{ t: 'call', id: 2, request: click }])
    fresh.answer({ t: 'result', id: 2, value: { ok: true } })
    await expect(next).resolves.toEqual({ ok: true })
  })

  it('times out when the page does not answer, and forgets the call', async () => {
    vi.useFakeTimers()
    try {
      const channel = new UiChannel()
      const page = fakePage(channel, 'w1')
      const check = codeOf(channel.call(click, { timeoutMs: 1000 }))
      vi.advanceTimersByTime(1001)
      expect(await check).toBe('timeout')
      // A late answer changes nothing.
      page.answer({ t: 'result', id: 1, value: { ok: true } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('honours cancellation, before and during the call', async () => {
    const channel = new UiChannel()
    fakePage(channel, 'w1')
    const early = new AbortController()
    early.abort()
    expect(await codeOf(channel.call(click, { signal: early.signal }))).toBe('aborted')
    const controller = new AbortController()
    const pending = channel.call(click, { signal: controller.signal })
    controller.abort()
    expect(await codeOf(pending)).toBe('aborted')
  })

  it('close settles every pending call as unloaded, closes the streams, and refuses later calls', async () => {
    const channel = new UiChannel()
    const page = fakePage(channel, 'w1')
    const pending = channel.call(click)
    channel.close()
    expect(await codeOf(pending)).toBe('unloaded')
    expect(page.stream.closed).toBe(true)
    expect(await codeOf(channel.call(click))).toBe('unloaded')
  })

  it('reports a page whose stream fails to send as disconnected', async () => {
    const channel = new UiChannel()
    channel.attach('w', true, { send: () => { throw new Error('boom') }, close() {} })
    expect(await codeOf(channel.call(click))).toBe('disconnected')
  })
})
