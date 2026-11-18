import { describe, expect, it } from 'vitest'
import type { GraphEvent, GraphSnapshot } from '../src/graph-contract.ts'
import type { GraphApi } from '../src/client/graph-api.ts'
import { LOST_TEXT, runLink, type Live } from '../src/client/graph-link.ts'

const snapshot = (name: string): GraphSnapshot => ({ capturedAt: '2026-01-01T00:00:00.000Z', plane: 'host', nodes: [{ uid: 0, name, phase: 'active', enabled: true, moduleName: null, loaderEntryId: null, provides: [], effects: [] }], edges: [] })
const event = (seq: number): GraphEvent => ({ seq, at: seq, uid: 1, name: 'a', phase: 'active', previous: 'loading' } as unknown as GraphEvent)

describe('the graph view link to the app', () => {
  it('says lost when the app stops answering, reads the graph again (the restarted app counts from the start) and goes live again by itself', async () => {
    const controller = new AbortController()
    const live: Live[] = []
    const names: string[] = []
    const asked: number[] = []
    let reads = 0
    // The app: first run (graph 'one', changes counted up to 40), then down for two reads, then a restarted app (graph 'two', changes counted from 1).
    const api: GraphApi = {
      async read() {
        reads += 1
        if (reads === 1) return { snapshot: snapshot('one'), seq: 40 }
        if (reads <= 3) throw new TypeError('Failed to fetch')
        return { snapshot: snapshot('two'), seq: 1 }
      },
      async events(after) {
        asked.push(after)
        if (after === 40) throw new TypeError('Failed to fetch')
        if (after === 1) { controller.abort(); return { seq: 1, events: [] } }
        throw new Error('unexpected')
      },
    }
    await runLink(api, { onLive: (state) => { live.push(state) }, onSnapshot: (view) => { names.push(view.nodes[0]?.name ?? '') }, onEvents: () => {} }, controller.signal, async () => {})
    expect(live).toEqual(['live', 'lost', 'lost', 'lost', 'live'])
    expect(names).toEqual(['one', 'two'])
    // After the restart the next wait is for changes after the NEW number, never the old 40.
    expect(asked).toEqual([40, 1])
  })

  it('hands changes over as they come and keeps asking after the newest number', async () => {
    const controller = new AbortController()
    const got: number[] = []
    const asked: number[] = []
    const api: GraphApi = {
      async read() { return { snapshot: snapshot('one'), seq: 0 } },
      async events(after) {
        asked.push(after)
        if (after === 0) return { seq: 2, events: [event(1), event(2)] }
        controller.abort()
        return { seq: 2, events: [] }
      },
    }
    await runLink(api, { onLive: () => {}, onSnapshot: () => {}, onEvents: (events) => { got.push(...events.map(one => one.seq)) } }, controller.signal, async () => {})
    expect(got).toEqual([1, 2])
    expect(asked).toEqual([0, 2])
  })

  it('stops at once when the view goes away, also in the middle of the wait', async () => {
    const controller = new AbortController()
    const api: GraphApi = { async read() { throw new TypeError('Failed to fetch') }, async events() { throw new Error('not asked') } }
    const running = runLink(api, { onLive: () => {}, onSnapshot: () => {}, onEvents: () => {} }, controller.signal)
    controller.abort()
    await expect(running).resolves.toBeUndefined()
  })

  it('speaks in plain words', () => {
    expect(LOST_TEXT).toBe('Lost the connection to the app, trying again...')
  })
})
