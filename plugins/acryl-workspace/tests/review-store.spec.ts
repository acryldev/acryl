import { describe, expect, it, vi } from 'vitest'
import { MAX_THREADS_PER_WORKTREE, parseSavedThreads, REVIEW_STORAGE_KEY, ReviewStore, startReviewPersistence } from '../src/client/workspace/review-store.ts'

const base = { worktree: '/p/a', file: 'src/x.ts', side: 'new' as const, line: 4, lineText: 'const a = 1', comment: 'rename this' }

describe('ReviewStore', () => {
  it('adds, resolves, reopens and removes threads per worktree, notifying only on real change', () => {
    const store = new ReviewStore([], () => 1000)
    const listener = vi.fn()
    store.subscribe(listener)
    const a = store.add(base)
    store.add({ ...base, worktree: '/p/b' })
    expect(a).toMatchObject({ id: 'r1', sentAt: 1000, resolved: false })
    expect(store.forWorktree('/p/a')).toHaveLength(1)
    expect(store.forWorktree('/p/b')).toHaveLength(1)

    listener.mockClear()
    store.setResolved(a.id, true)
    store.setResolved(a.id, true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.forWorktree('/p/a')[0]?.resolved).toBe(true)
    store.setResolved(a.id, false)
    store.remove(a.id)
    store.remove(a.id)
    expect(store.forWorktree('/p/a')).toEqual([])
    expect(store.forWorktree('/p/b')).toHaveLength(1)
  })

  it('changes its version on every mutation and keeps ids unique across a restore', () => {
    const store = new ReviewStore()
    const v0 = store.getVersion()
    store.add(base)
    expect(store.getVersion()).toBeGreaterThan(v0)
    const restored = new ReviewStore(store.all())
    expect(restored.add(base).id).toBe('r2')
  })

  it('keeps only the newest threads per worktree', () => {
    const store = new ReviewStore()
    for (let i = 0; i < MAX_THREADS_PER_WORKTREE + 5; i += 1) store.add({ ...base, line: i })
    const mine = store.forWorktree('/p/a')
    expect(mine).toHaveLength(MAX_THREADS_PER_WORKTREE)
    expect(mine.at(-1)?.line).toBe(MAX_THREADS_PER_WORKTREE + 4)
  })

  it('parses saved threads defensively', () => {
    const good = new ReviewStore([], () => 5)
    good.add(base)
    expect(parseSavedThreads(JSON.stringify(good.all()))).toHaveLength(1)
    expect(parseSavedThreads(null)).toEqual([])
    expect(parseSavedThreads('not json')).toEqual([])
    expect(parseSavedThreads('{"a":1}')).toEqual([])
    expect(parseSavedThreads(JSON.stringify([{ id: 1 }, { ...good.all()[0], side: 'left' }, good.all()[0]]))).toHaveLength(1)
  })

  it('persists on change and survives broken storage', () => {
    const writes: string[] = []
    const store = new ReviewStore()
    const stop = startReviewPersistence(store, { setItem: (key, value) => { expect(key).toBe(REVIEW_STORAGE_KEY); writes.push(value) } })
    store.add(base)
    expect(parseSavedThreads(writes.at(-1))).toHaveLength(1)
    stop()
    store.add(base)
    expect(writes).toHaveLength(1)

    const broken = new ReviewStore()
    startReviewPersistence(broken, { setItem: () => { throw new Error('full') } })
    expect(() => broken.add(base)).not.toThrow()
    expect(startReviewPersistence(broken, undefined)).toBeTypeOf('function')
  })
})
