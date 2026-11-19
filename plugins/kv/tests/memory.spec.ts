import { describe, expect, expectTypeOf, it } from 'vitest'
import { checkKey, compareKeys, copyKv, decodeValue, encodeValue, type Kv, type KvOpened, runChange } from '../src/index.ts'
import { describeKvConformance, type KvUnderTest } from '../src/conformance.ts'

/** The smallest store that meets the contract, so the suite is itself tested: a map of JSON text, with a queue for atomic updates. */
function memoryStore(shared: Map<string, string> = new Map()): KvUnderTest {
  let closed = false
  let tail: Promise<unknown> = Promise.resolve()
  const guard = (): void => {
    if (closed) throw new Error('closed')
  }
  const queue = <T>(work: () => T): Promise<T> => {
    const next = tail.then(work)
    tail = next.catch(() => undefined)
    return next
  }
  const kv: Kv = {
    get: async key => { guard(); checkKey(key); const text = shared.get(key); return text === undefined ? undefined : decodeValue(text) },
    set: (key, value) => queue(() => { guard(); checkKey(key); shared.set(key, encodeValue(value)) }),
    update: (key, change) => queue(() => {
      guard()
      checkKey(key)
      const text = shared.get(key)
      const next = runChange(change as (current: unknown) => never, text === undefined ? undefined : decodeValue(text))
      shared.set(key, encodeValue(next))
      return decodeValue(shared.get(key)!)
    }),
    delete: key => queue(() => { guard(); checkKey(key); shared.delete(key) }),
    list: async prefix => { guard(); return [...shared.keys()].filter(key => key.startsWith(prefix ?? '')).sort(compareKeys) },
  }
  return {
    kv,
    close: async () => { await tail; closed = true },
    reopen: async () => { await tail; closed = true; return memoryStore(shared) },
  }
}

describeKvConformance('the in-memory reference', async () => memoryStore())

describe('compareKeys', () => {
  it('orders by code point', () => {
    expect(['\u{1F600}', '～', 'b', 'a', 'B', ''].sort(compareKeys)).toEqual(['', 'B', 'a', 'b', '～', '\u{1F600}'])
    expect(compareKeys('a', 'a')).toBe(0)
    expect(compareKeys('ab', 'a')).toBeGreaterThan(0)
  })
})

describe('encodeValue and checkKey', () => {
  it('refuse what JSON cannot hold, and accept what it can', () => {
    for (const value of [undefined, () => 1, Symbol('s'), 1n, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => encodeValue(value)).toThrow(TypeError)
    expect(encodeValue({ a: [1, null, 'x'] })).toBe('{"a":[1,null,"x"]}')
    expect(() => checkKey('')).toThrow(TypeError)
    expect(() => checkKey('k')).not.toThrow()
  })
})

describe('the update callback type', () => {
  it('refuses an async function at compile time', () => {
    const kv = memoryStore().kv
    // @ts-expect-error an async callback returns a promise
    void kv.update<number>('k', async current => (current ?? 0) + 1).catch(() => undefined)
    expectTypeOf<KvOpened['kv']>().toEqualTypeOf<Kv>()
  })
})

describe('copyKv', () => {
  it('copies every key, refuses to overwrite unless asked, and honours a prefix', async () => {
    const source = memoryStore().kv
    const target = memoryStore().kv
    await source.set('a/1', 1)
    await source.set('a/2', { n: 2 })
    await source.set('b', 'x')
    expect(await copyKv(source, target)).toEqual({ copied: 3, overwritten: 0 })
    expect(await target.list()).toEqual(['a/1', 'a/2', 'b'])
    await expect(copyKv(source, target)).rejects.toThrow(/already has 3/u)
    await target.set('a/1', 'changed')
    expect(await copyKv(source, target, { overwrite: true, prefix: 'a/' })).toEqual({ copied: 2, overwritten: 2 })
    expect(await target.get('a/1')).toBe(1)
    expect(await source.list()).toEqual(['a/1', 'a/2', 'b'])
  })
  it('writes nothing when it refuses', async () => {
    const source = memoryStore().kv
    const target = memoryStore().kv
    await source.set('x', 1)
    await source.set('y', 2)
    await target.set('y', 0)
    await expect(copyKv(source, target)).rejects.toThrow()
    expect(await target.list()).toEqual(['y'])
    expect(await target.get('y')).toBe(0)
  })
})
