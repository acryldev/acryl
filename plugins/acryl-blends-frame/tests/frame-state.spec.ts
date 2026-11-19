import { describe, expect, it } from 'vitest'
import { FrameStateStore, shouldReadOnTick } from '../src/client/frame-state.ts'

const state = (unsaved: number) => ({ appName: 'notes', appRoot: '/apps/notes', branches: [{ name: 'main', current: true }], unsaved })

/** A valid answer of the Host's state route, as the store parses it. */
const answer = {
  appName: 'blank',
  appRoot: '/tmp/blank',
  appPage: '/app',
  branches: [{ name: 'main', current: true }],
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

describe('the frame state a decision reads', () => {
  it('is read from the Host at the moment of the decision, not taken from the last poll', async () => {
    const answers = [state(0), state(3)]
    const store = new FrameStateStore(async () => new Response(JSON.stringify(answers.shift())))
    await store.refresh()
    const shown = store.getSnapshot()
    expect(shown.status === 'ready' ? shown.state.unsaved : undefined).toBe(0)
    let told = 0
    store.subscribe(() => { told += 1 })
    // A file changed since the poll: the decision sees 3, and what is shown follows it.
    expect((await store.current())?.unsaved).toBe(3)
    expect(told).toBe(1)
  })

  it('is undefined when the Host cannot be read, while the page keeps what it showed', async () => {
    let up = true
    const store = new FrameStateStore(async () => (up ? new Response(JSON.stringify(state(0))) : new Response('', { status: 502 })))
    await store.refresh()
    up = false
    expect(await store.current()).toBeUndefined()
    expect(store.getSnapshot().status).toBe('ready')
  })
})

describe('shouldReadOnTick', () => {
  it('reads while the page is visible', () => {
    expect(shouldReadOnTick('visible', 'ready')).toBe(true)
    expect(shouldReadOnTick('visible', 'loading')).toBe(true)
    expect(shouldReadOnTick('visible', 'error')).toBe(true)
  })

  it('keeps retrying until the first successful read even while the page is hidden', () => {
    // The canvas waits on that read: a failed one on a hidden page (a headless tab, a window behind another) must not wait for a focus.
    expect(shouldReadOnTick('hidden', 'loading')).toBe(true)
    expect(shouldReadOnTick('hidden', 'error')).toBe(true)
  })

  it('does no work on a hidden page once the state is showing', () => {
    expect(shouldReadOnTick('hidden', 'ready')).toBe(false)
  })
})

describe('the poll under a slow Host', () => {
  it('joins the read in flight instead of starting one whose answer would discard the first (the slow-read livelock)', async () => {
    let calls = 0
    const store = new FrameStateStore(async () => {
      calls += 1
      await sleep(150)
      return new Response(JSON.stringify(answer), { status: 200 })
    })
    const first = store.refresh()
    // The 5 s tick arriving while the Host's git-heavy read is still out: with a second read started here, the first answer would be
    // stale on arrival and dropped, and (the tick being faster than the read) the page would never become ready.
    await sleep(20)
    await store.refresh()
    await first
    expect(store.getSnapshot().status).toBe('ready')
    expect(calls).toBe(1)
    // Once nothing is in flight, the next tick reads again.
    await store.refresh()
    expect(calls).toBe(2)
  })

  it('retries after a failed read and shows the answer when it arrives', async () => {
    let calls = 0
    const store = new FrameStateStore(async () => {
      calls += 1
      if (calls === 1) throw new Error('the Host is busy')
      return new Response(JSON.stringify(answer), { status: 200 })
    })
    await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ status: 'error' })
    await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', state: { appPage: '/app' } })
  })
})
