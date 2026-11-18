import { describe, expect, it, vi } from 'vitest'
import { UiControlError, type ChannelToPage, type UiRequest } from '../../src/page/protocol.ts'
import { UiChannel, type PageStream } from '../../src/host/channel.ts'

/**
 * A page. By default it only records the calls, and the test answers by hand. `reply` makes it answer by itself, as the page script does: 'ack' says it heard each call and nothing more
 * (a page whose work never finishes), 'full' acknowledges and then answers, at once.
 */
function fakePage(channel: UiChannel, windowId: string, focused = true, shellWindow?: number, reply?: 'ack' | 'full', tab?: string) {
  const sent: ChannelToPage[] = []
  const notes: string[] = []
  const stream: PageStream & { closed: boolean } = {
    closed: false,
    notify: (event, data) => { notes.push(`${event}=${data}`) },
    send: (data) => {
      const frame = JSON.parse(data) as ChannelToPage
      sent.push(frame)
      if (reply === undefined) return
      queueMicrotask(() => {
        channel.receive(windowId, { t: 'ack', id: frame.id })
        if (reply === 'full') channel.receive(windowId, { t: 'result', id: frame.id, value: { ok: true, detail: windowId } })
      })
    },
    close() { this.closed = true },
  }
  const end = channel.attach(windowId, focused, stream, shellWindow, tab)
  return { end, sent, notes, stream, answer: (message: Parameters<UiChannel['receive']>[1]) => { channel.receive(windowId, message) } }
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


describe('waiting for pages to come back', () => {
  it('expectAttach resolves true when a page connects, false when none does in time', async () => {
    const channel = new UiChannel()
    const waiting = channel.expectAttach(1000)
    fakePage(channel, 'w1')
    expect(await waiting).toBe(true)
    expect(await channel.expectAttach(20)).toBe(false)
  })

  it('reloadAll asks every page to reload, resolves when as many pages have come back, and answers 0 when nobody is connected', async () => {
    const channel = new UiChannel()
    expect(await channel.reloadAll(20)).toBe(0)
    const first = fakePage(channel, 'w1')
    const second = fakePage(channel, 'w2')
    const done = channel.reloadAll(1000)
    expect(first.sent.at(-1)).toMatchObject({ t: 'call', request: { op: 'reload' } })
    expect(second.sent.at(-1)).toMatchObject({ t: 'call', request: { op: 'reload' } })
    // The pages reload: new streams, new window ids.
    first.end()
    second.end()
    fakePage(channel, 'w3')
    fakePage(channel, 'w4')
    expect(await done).toBe(2)
  })

  it('reloadAll gives up after its time when a page does not come back', async () => {
    const channel = new UiChannel()
    fakePage(channel, 'w1')
    const started = Date.now()
    expect(await channel.reloadAll(60)).toBe(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  })

  it('drives the page of the desktop window it is told to, not the one used last, and names the windows it has when there is none', async () => {
    const channel = new UiChannel()
    const one = fakePage(channel, 'w1', true, 1)
    const two = fakePage(channel, 'w2', true, 2)
    const plain = fakePage(channel, 'w3', true)
    plain.answer({ t: 'focus', focused: true })
    const pending = channel.call(click, { window: 1 })
    expect(one.sent).toHaveLength(1)
    expect(two.sent).toHaveLength(0)
    expect(plain.sent).toHaveLength(0)
    one.answer({ t: 'result', id: 1, value: { ok: true } })
    await pending
    // A page of another window cannot answer it, and a window with no page names the ones that have one.
    const missing = channel.call(click, { window: 7 })
    await expect(missing).rejects.toMatchObject({ code: 'no-window', message: expect.stringMatching(/window 7.*windows with a page: [12], [12]/u) })
    expect(channel.windows().map(window => window.shellWindow)).toEqual([undefined, 2, 1])
    // Without a window the page used last is driven, as before.
    const last = channel.call(click)
    expect(plain.sent).toHaveLength(1)
    plain.answer({ t: 'result', id: 2, value: { ok: true } })
    await last
  })

  describe('which page answers', () => {
    const lookOp: UiRequest = { op: 'snapshot' }

    it('goes to the next page when the first does not acknowledge a read-only call, puts the silent one last, and does not send it the calls that follow', async () => {
      const channel = new UiChannel({ ackMs: 30 })
      const live = fakePage(channel, 'live', true, undefined, 'full')
      const ghost = fakePage(channel, 'ghost', true)
      ghost.answer({ t: 'focus', focused: true })
      // The ghost is first in line (it is the most recent) and never speaks; the live page answers.
      expect(await channel.call(lookOp)).toEqual({ ok: true, detail: 'live' })
      expect(ghost.sent).toHaveLength(1)
      expect(live.sent).toHaveLength(1)
      // The ghost is last in line now: a click goes to the live page and is never also sent to the ghost.
      await channel.call(click)
      expect(live.sent).toHaveLength(2)
      expect(ghost.sent).toHaveLength(1)
      // The ghost speaks again (the tab woke up): it is trusted again, and first, because it is in front.
      ghost.answer({ t: 'focus', focused: true })
      const again = channel.call(lookOp)
      expect(ghost.sent).toHaveLength(2)
      ghost.answer({ t: 'ack', id: 4 })
      ghost.answer({ t: 'result', id: 4, value: { ok: true, detail: 'ghost' } })
      expect(await again).toEqual({ ok: true, detail: 'ghost' })
    })

    it('waits the whole time for a page that acknowledged, and never takes a call that changes the page to a second page', async () => {
      const channel = new UiChannel({ ackMs: 20 })
      const slow = fakePage(channel, 'slow', true, undefined, 'ack')
      const other = fakePage(channel, 'other', true, undefined, 'full')
      slow.answer({ t: 'focus', focused: true })
      // The slow page acknowledges at once and answers late: past the acknowledgement time nothing is re-sent to `other`.
      const looked = channel.call(lookOp)
      await new Promise(resolve => setTimeout(resolve, 80))
      expect(other.sent).toHaveLength(0)
      slow.answer({ t: 'result', id: 1, value: { ok: true } })
      await looked
      // A click to a page that never acknowledges is not re-sent anywhere: it times out on its own.
      const silent = new UiChannel({ ackMs: 20 })
      const mute = fakePage(silent, 'mute', true)
      const spare = fakePage(silent, 'spare', true, undefined, 'full')
      mute.answer({ t: 'focus', focused: true })
      const clicked = silent.call(click, { timeoutMs: 100 })
      expect(await codeOf(clicked)).toBe('timeout')
      expect(spare.sent).toHaveLength(0)
    })

    it('drives the page the Host sent somewhere until the person focuses another, then the one in front, then the most recently active', async () => {
      const channel = new UiChannel()
      const panel = fakePage(channel, 'panel', true)
      const board = fakePage(channel, 'board', false)
      panel.answer({ t: 'focus', focused: true })
      // Focused beats merely newer.
      const first = channel.call(click)
      expect(panel.sent).toHaveLength(1)
      panel.answer({ t: 'result', id: 1, value: { ok: true } })
      await first
      // The Host sent the board somewhere and it came back: it is driven even though the panel is in front.
      channel.prefer('board')
      const second = channel.call(click)
      expect(board.sent).toHaveLength(1)
      board.answer({ t: 'result', id: 2, value: { ok: true } })
      await second
      // The person focuses the panel: the insistence ends.
      panel.answer({ t: 'focus', focused: true })
      const third = channel.call(click)
      expect(panel.sent).toHaveLength(2)
      panel.answer({ t: 'result', id: 3, value: { ok: true } })
      await third
    })

    it('drives the page whose panel asked for the run, over a tab the Host sent somewhere and over the page in front, until the run ends', async () => {
      const channel = new UiChannel()
      const tab = fakePage(channel, 'tab', true, undefined, 'full')
      const window = fakePage(channel, 'window', false, 3, 'full')
      // The agent navigated the tab earlier in the day, so the Host insists on it, and the tab is the page in front.
      channel.prefer('tab')
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'tab' })
      // A run asked for from the window's panel: its calls (no `window` named) go to the window.
      const end = channel.driveFor('window')
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'window' })
      expect(await channel.call(lookOp)).toEqual({ ok: true, detail: 'window' })
      // An explicit desktop window still picks its page.
      const other = fakePage(channel, 'other', false, 9, 'full')
      expect(await channel.call(click, { window: 9 })).toEqual({ ok: true, detail: 'other' })
      expect(other.sent).toHaveLength(1)
      // The person focusing the tab does not take the run away from the page that asked.
      tab.answer({ t: 'focus', focused: true })
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'window' })
      end()
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'tab' })
      expect(window.sent).toHaveLength(3)
    })

    it('goes on with the other pages when the asking page goes away, and follows it to the page it comes back as', async () => {
      const channel = new UiChannel()
      const tab = fakePage(channel, 'tab', true, undefined, 'full')
      const asking = fakePage(channel, 'asking', false, undefined, 'full')
      channel.driveFor('asking')
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'asking' })
      // The asking page reloads: while it is gone the tab answers, and the page that comes back is the one the run drives.
      asking.end()
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'tab' })
      fakePage(channel, 'asking-again', false, undefined, 'full')
      channel.prefer('asking-again')
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'asking-again' })
      tab.answer({ t: 'focus', focused: true })
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'asking-again' })
    })

    it('tells the asking page when its run starts and ends, again when it comes back as a new page, and not while another run of the page goes on', async () => {
      const channel = new UiChannel()
      const asking = fakePage(channel, 'asking', false, undefined, 'full')
      const bystander = fakePage(channel, 'bystander', true, undefined, 'full')
      const endFirst = channel.driveFor('asking')
      const endSecond = channel.driveFor('asking')
      expect(asking.notes).toEqual(['run=1', 'run=1'])
      endFirst()
      expect(asking.notes).toEqual(['run=1', 'run=1'])
      endSecond()
      expect(asking.notes.at(-1)).toBe('run=0')
      expect(bystander.notes).toEqual([])
      // A page that reloads during its run is told on reconnecting; the run ending later is told to the page that is there.
      const end = channel.driveFor('asking')
      asking.end()
      const back = fakePage(channel, 'asking-again', false, undefined, 'full')
      channel.prefer('asking-again')
      expect(back.notes).toEqual(['run=1'])
      end()
      expect(back.notes).toEqual(['run=1', 'run=0'])
    })

    it('does not put a page that did not answer first because it asked', async () => {
      const channel = new UiChannel({ ackMs: 30 })
      const live = fakePage(channel, 'live', true, undefined, 'full')
      fakePage(channel, 'ghost', true)
      channel.driveFor('ghost')
      // The ghost is asked first (it asked), is silent, and the live page answers; from then on the ghost is last.
      expect(await channel.call(lookOp)).toEqual({ ok: true, detail: 'live' })
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'live' })
      expect(live.sent).toHaveLength(2)
    })

    it('answers the latest of two runs that are going', async () => {
      const channel = new UiChannel()
      fakePage(channel, 'one', false, undefined, 'full')
      fakePage(channel, 'two', false, undefined, 'full')
      const endOne = channel.driveFor('one')
      const endTwo = channel.driveFor('two')
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'two' })
      endTwo()
      expect(await channel.call(click)).toEqual({ ok: true, detail: 'one' })
      endOne()
    })

    it('gives up on a read-only call when every page is silent, in the time a page has to acknowledge and not the whole call timeout, and says what to do', async () => {
      const channel = new UiChannel({ ackMs: 30 })
      fakePage(channel, 'one', true)
      fakePage(channel, 'two', true)
      await expect(channel.call(lookOp)).rejects.toMatchObject({ code: 'timeout', message: expect.stringMatching(/none responded.*front/u) })
    })

    it('keeps a silent page last in line when its stream reconnects, and trusts it again once it speaks', async () => {
      const channel = new UiChannel({ ackMs: 30 })
      const live = fakePage(channel, 'live', true, undefined, 'full')
      fakePage(channel, 'tab', true)
      await channel.call(lookOp)
      // The tab reconnects (a new stream, the same window), as an unreachable tab does: it is the newest page, and still last.
      const tab = fakePage(channel, 'tab', true)
      await channel.call(click)
      expect(live.sent).toHaveLength(2)
      expect(tab.sent).toHaveLength(0)
      tab.answer({ t: 'focus', focused: true })
      const back = channel.call(click)
      expect(tab.sent).toHaveLength(1)
      tab.answer({ t: 'result', id: 4, value: { ok: true } })
      await back
    })

    it('waits for a page that is moving to register (a look right after a navigate), and fails with no-window when none does', async () => {
      const channel = new UiChannel({ attachWaitMs: 300 })
      const looking = channel.call(lookOp)
      setTimeout(() => { fakePage(channel, 'back', true, undefined, 'full') }, 60)
      expect(await looking).toEqual({ ok: true, detail: 'back' })
      const none = new UiChannel({ attachWaitMs: 100 })
      const started = Date.now()
      expect(await codeOf(none.call(lookOp))).toBe('no-window')
      expect(Date.now() - started).toBeGreaterThanOrEqual(90)
      // A call that changes the page never waits: it would be a guess about which page the person meant.
      expect(await codeOf(none.call(click))).toBe('no-window')
    })

    it('gives a read-only call that no page acknowledged one more try when a page registered meanwhile', async () => {
      const channel = new UiChannel({ ackMs: 40, attachWaitMs: 400 })
      fakePage(channel, 'old', true)
      const looking = channel.call(lookOp)
      // The old page never speaks; the page it was moving to registers while the door waits.
      setTimeout(() => { fakePage(channel, 'new', true, undefined, 'full') }, 120)
      expect(await looking).toEqual({ ok: true, detail: 'new' })
    })

    it('tells expectNewPage which page came back: a window id that was not connected when it was asked', async () => {
      const channel = new UiChannel()
      fakePage(channel, 'old', true)
      const back = channel.expectNewPage(500)
      fakePage(channel, 'old', true)
      fakePage(channel, 'new', true)
      expect(await back).toBe('new')
      await expect(channel.expectNewPage(20)).resolves.toBeUndefined()
    })
  })
})

describe('one page per visitor (the Assistant)', () => {
  it('refuses a call that names no page, even with pages open', async () => {
    const channel = new UiChannel({ requirePage: true })
    const page = fakePage(channel, 'w1', true, undefined, 'full')
    expect(await codeOf(channel.call(click))).toBe('no-window')
    expect(page.sent).toHaveLength(0)
    await expect(channel.call(click, { page: 'w1' })).resolves.toEqual({ ok: true, detail: 'w1' })
  })

  it("a run's calls go to its visitor's page alone, never to the page used last or another visitor's", async () => {
    const channel = new UiChannel({ requirePage: true })
    const a = fakePage(channel, 'wa', true, undefined, 'full', 'tab-a')
    const b = fakePage(channel, 'wb', true, undefined, 'full', 'tab-b')
    channel.prefer('wb')
    const endA = channel.driveFor('wa')
    await expect(channel.call(click, { page: 'wa' })).resolves.toEqual({ ok: true, detail: 'wa' })
    expect(b.sent).toHaveLength(0)
    expect(a.sent).toHaveLength(1)
    endA()
  })

  it("follows the visitor's page into its next document in the same tab, and waits for it rather than taking another visitor's page", async () => {
    const channel = new UiChannel({ requirePage: true, attachWaitMs: 200 })
    const a = fakePage(channel, 'wa', true, undefined, 'full', 'tab-a')
    const b = fakePage(channel, 'wb', true, undefined, 'full', 'tab-b')
    const endA = channel.driveFor('wa')
    // A's page leaves for /my-tasks; B's page is preferred meanwhile; A's next document arrives in A's tab.
    const back = channel.expectPageBack('wa', 1000)
    a.end()
    channel.prefer('wb')
    const pending = channel.call(click, { page: 'wa' })
    const a2 = fakePage(channel, 'wa2', true, undefined, 'full', 'tab-a')
    expect(await back).toBe('wa2')
    await expect(pending).resolves.toEqual({ ok: true, detail: 'wa2' })
    expect(b.sent).toHaveLength(0)
    expect(a2.sent).toHaveLength(1)
    // A's page closes for good: the run's call fails after the wait, and B's page is still not taken.
    a2.end()
    expect(await codeOf(channel.call(click, { page: 'wa' }))).toBe('no-window')
    expect(b.sent).toHaveLength(0)
    endA()
  })
})
