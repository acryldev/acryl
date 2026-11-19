import { describe, expect, it } from 'vitest'
import { FrameStateStore } from '../src/client/frame-state.ts'

const state = (unsaved: number) => ({ appName: 'notes', appRoot: '/apps/notes', branches: [{ name: 'main', current: true }], unsaved })

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
