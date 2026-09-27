import { describe, expect, it, vi } from 'vitest'
import { UiControlError, type ChannelToPage, type UiRequest } from '../../src/contract.ts'
import { UiChannel, type PageSocket } from '../../src/host/channel.ts'

function fakePage(channel: UiChannel, windowId: string, focused = true) {
  const sent: ChannelToPage[] = []
  const socket: PageSocket & { closed: boolean } = { closed: false, send: (data) => { sent.push(JSON.parse(data) as ChannelToPage) }, close() { this.closed = true } }
  const page = channel.attach(socket)
  page.onMessage({ t: 'hello', windowId, focused })
  return { page, sent, socket }
}

const click: UiRequest = { op: 'click', ref: '1.1' }
const codeOf = async (promise: Promise<unknown>): Promise<string> => { try { await promise; return 'ok' } catch (cause) { return cause instanceof UiControlError ? cause.code : 'other' } }

describe('UiChannel', () => {
  it('sends a call to the page and resolves with what the page answers', async () => {
    const channel = new UiChannel()
    const { page, sent } = fakePage(channel, 'w1')
    const result = channel.call(click)
    expect(sent).toEqual([{ t: 'call', id: 1, request: click }])
    page.onMessage({ t: 'result', id: 1, value: { ok: true, target: { role: 'button', name: 'Go' } } })
    expect(await result).toEqual({ ok: true, target: { role: 'button', name: 'Go' } })
  })

  it('rejects with the page’s own reason when it refuses', async () => {
    const channel = new UiChannel()
    const { page } = fakePage(channel, 'w1')
    const result = channel.call(click)
    page.onMessage({ t: 'error', id: 1, code: 'stale-ref', message: 'take a new snapshot' })
    await expect(result).rejects.toMatchObject({ code: 'stale-ref', message: 'take a new snapshot' })
  })

  it('has no window to control until a page connects', async () => {
    const channel = new UiChannel()
    expect(channel.connected).toBe(false)
    expect(await codeOf(channel.call(click))).toBe('no-window')
  })

  it('drives the window the user focused last, and only that window may answer', async () => {
    const channel = new UiChannel()
    const first = fakePage(channel, 'w1')
    const second = fakePage(channel, 'w2', false)
    first.page.onMessage({ t: 'focus', focused: true })
    const pending = channel.call(click)
    expect(first.sent).toHaveLength(1)
    expect(second.sent).toHaveLength(0)
    // The other window cannot forge the answer.
    second.page.onMessage({ t: 'result', id: 1, value: { ok: true } })
    let settled = false
    void pending.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    first.page.onMessage({ t: 'result', id: 1, value: { ok: true } })
    await expect(pending).resolves.toEqual({ ok: true })
    // Focus moves; the next call follows it.
    second.page.onMessage({ t: 'focus', focused: true })
    void channel.call(click).catch(() => {})
    expect(second.sent).toHaveLength(1)
    expect(channel.windows().map(w => w.windowId)).toEqual(['w2', 'w1'])
  })

  it('settles a call as no-window when its page disconnects', async () => {
    const channel = new UiChannel()
    const { page } = fakePage(channel, 'w1')
    const pending = channel.call(click)
    page.onClose()
    expect(await codeOf(pending)).toBe('no-window')
    expect(channel.connected).toBe(false)
  })

  it('times out when the page does not answer, and forgets the call', async () => {
    vi.useFakeTimers()
    const channel = new UiChannel()
    const { page } = fakePage(channel, 'w1')
    const pending = channel.call(click, { timeoutMs: 1000 })
    const check = codeOf(pending)
    vi.advanceTimersByTime(1001)
    expect(await check).toBe('timeout')
    // A late answer changes nothing.
    page.onMessage({ t: 'result', id: 1, value: { ok: true } })
    vi.useRealTimers()
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

  it('close settles every pending call as unloaded, closes the pages, and refuses later calls', async () => {
    const channel = new UiChannel()
    const { socket } = fakePage(channel, 'w1')
    const pending = channel.call(click)
    channel.close()
    expect(await codeOf(pending)).toBe('unloaded')
    expect(socket.closed).toBe(true)
    expect(await codeOf(channel.call(click))).toBe('unloaded')
  })

  it('reports a page whose socket fails to send as unreachable', async () => {
    const channel = new UiChannel()
    channel.attach({ send: () => { throw new Error('boom') }, close() {} }).onMessage({ t: 'hello', windowId: 'w', focused: true })
    expect(await codeOf(channel.call(click))).toBe('no-window')
  })
})
