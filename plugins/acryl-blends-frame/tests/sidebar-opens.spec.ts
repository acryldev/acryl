import { describe, expect, it } from 'vitest'
import { watchSidebarOpens, type SidebarRightOpens } from '../src/client/sidebar-opens.ts'

/** A store with DSH's `getSnapshot`/`subscribe` shape. */
function store<T>(value: T) {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: T) => { value = next; for (const listener of listeners) listener() },
    listeners,
  }
}

/** DSH's sidebar as the watcher reads it: the open tabs, and each tab's navigation record once it has one. */
function sidebar() {
  const openTabs = store<readonly { sessionId: string; tabId: string }[]>([])
  const records = new Map<string, ReturnType<typeof store<{ revision: number }>>>()
  const opens: SidebarRightOpens = {
    openTabs,
    tabDomain: {
      occurrence: (sessionId, tab) => {
        const navigation = records.get(`${sessionId}/${tab.id}`)
        if (navigation === undefined) throw new Error('no record')
        return { navigation }
      },
    },
  }
  const record = (sessionId: string, tabId: string, revision: number) => {
    const navigation = store({ revision })
    records.set(`${sessionId}/${tabId}`, navigation)
    return navigation
  }
  return { opens, openTabs, record }
}

describe('the opens of DSH\'s right sidebar', () => {
  it('hears a new page and a page opened again, not the tabs already there or brought back', async () => {
    const s = sidebar()
    s.record('s1', 'guide', 0)
    const plan = s.record('s1', 'plan', 1)
    s.openTabs.set([{ sessionId: 's1', tabId: 'guide' }, { sessionId: 's1', tabId: 'plan' }])
    let opened = 0
    const stop = watchSidebarOpens(s.opens, () => { opened++ })
    expect(opened).toBe(0)

    // A changed file opens as a new tab whose record comes first.
    s.record('s1', 'review', 1)
    s.openTabs.set([...s.openTabs.getSnapshot(), { sessionId: 's1', tabId: 'review' }])
    expect(opened).toBe(1)

    // The plan opened again from its card: the same tab, navigated once more.
    plan.set({ revision: 2 })
    expect(opened).toBe(2)

    // Another chat brings its saved tabs back: nobody opened them.
    s.record('s2', 'files', 0)
    s.openTabs.set([...s.openTabs.getSnapshot(), { sessionId: 's2', tabId: 'files' }])
    expect(opened).toBe(2)

    // A tab listed a moment before its record is looked at again once the change settles.
    s.openTabs.set([...s.openTabs.getSnapshot(), { sessionId: 's1', tabId: 'late' }])
    s.record('s1', 'late', 1)
    await Promise.resolve()
    expect(opened).toBe(3)

    stop()
    plan.set({ revision: 3 })
    expect(opened).toBe(3)
    expect(s.openTabs.listeners.size).toBe(0)
    expect(plan.listeners.size).toBe(0)
  })

  it('lets go of a closed tab', () => {
    const s = sidebar()
    const review = s.record('s1', 'review', 1)
    s.openTabs.set([{ sessionId: 's1', tabId: 'review' }])
    const stop = watchSidebarOpens(s.opens, () => {})
    expect(review.listeners.size).toBe(1)
    s.openTabs.set([])
    expect(review.listeners.size).toBe(0)
    stop()
  })
})
