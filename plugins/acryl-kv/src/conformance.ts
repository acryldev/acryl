/**
 * The `kv` conformance suite: what every provider of the port must do, as Vitest tests. A provider passes it to be accepted
 * (`describeKvConformance('acryl-kv-json', open)` in its own tests), so the same cases run on a file and on SQL.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { Kv } from './kv.ts'

/** A fresh, empty store from the provider under test. */
export interface KvUnderTest {
  readonly kv: Kv
  close(): Promise<void>
  /** Close this store (if it is still open) and open the same storage again, to prove what was written is durable. */
  reopen(): Promise<KvUnderTest>
}

export function describeKvConformance(provider: string, open: () => Promise<KvUnderTest>): void {
  describe(`kv conformance: ${provider}`, () => {
    const opened: KvUnderTest[] = []
    const track = (subject: KvUnderTest): KvUnderTest => {
      opened.push(subject)
      return subject
    }
    const fresh = async (): Promise<Kv> => track(await open()).kv
    afterEach(async () => {
      await Promise.all(opened.splice(0).map(subject => subject.close()))
    })

    it('round-trips null, booleans, numbers, text with unicode, arrays and nested objects', async () => {
      const kv = await fresh()
      const values: unknown[] = [null, true, false, 0, -1.5, 9_007_199_254_740_991, '', 'café ✓ 😀', [], [1, [2, [3]]], {}, { a: { b: [1, { c: null }] }, 'ключ': 'значение' }]
      for (const [index, value] of values.entries()) {
        await kv.set(`value/${index}`, value)
        expect(await kv.get(`value/${index}`), JSON.stringify(value)).toEqual(value)
      }
    })

    it('answers get with undefined for a missing key, and overwrites on set', async () => {
      const kv = await fresh()
      expect(await kv.get('missing')).toBeUndefined()
      await kv.set('k', { n: 1 })
      await kv.set('k', { n: 2 })
      expect(await kv.get('k')).toEqual({ n: 2 })
    })

    it('deletes a key, and a missing key is not an error', async () => {
      const kv = await fresh()
      await kv.set('k', 1)
      await kv.delete('k')
      expect(await kv.get('k')).toBeUndefined()
      await expect(kv.delete('k')).resolves.toBeUndefined()
      await expect(kv.delete('never-existed')).resolves.toBeUndefined()
    })

    it('stores a null value as null, apart from a missing key', async () => {
      const kv = await fresh()
      await kv.set('k', null)
      expect(await kv.get('k')).toBeNull()
      expect(await kv.list()).toEqual(['k'])
    })

    it('lists keys sorted by code point, with an optional prefix', async () => {
      const kv = await fresh()
      for (const key of ['b', 'a/2', 'a/10', 'a/1', 'ab', 'B', 'a']) await kv.set(key, key)
      expect(await kv.list()).toEqual(['B', 'a', 'a/1', 'a/10', 'a/2', 'ab', 'b'])
      expect(await kv.list('a/')).toEqual(['a/1', 'a/10', 'a/2'])
      expect(await kv.list('a')).toEqual(['a', 'a/1', 'a/10', 'a/2', 'ab'])
      expect(await kv.list('')).toEqual(['B', 'a', 'a/1', 'a/10', 'a/2', 'ab', 'b'])
      expect(await kv.list('nothing')).toEqual([])
      expect(await kv.list(undefined)).toEqual(await kv.list())
    })

    it('orders astral characters after the rest of the basic plane, as code points', async () => {
      const kv = await fresh()
      for (const key of ['\u{1F600}', '～', 'z', '']) await kv.set(key, 1)
      expect(await kv.list()).toEqual(['z', '', '～', '\u{1F600}'])
    })

    it('treats % _ \\ and letter case in a prefix as plain characters', async () => {
      const kv = await fresh()
      for (const key of ['100%', '100x', 'a_b', 'axb', 'Abc', 'abc', 'back\\slash', 'backXslash']) await kv.set(key, 1)
      expect(await kv.list('100%')).toEqual(['100%'])
      expect(await kv.list('a_')).toEqual(['a_b'])
      expect(await kv.list('ab')).toEqual(['abc'])
      expect(await kv.list('Ab')).toEqual(['Abc'])
      expect(await kv.list('back\\')).toEqual(['back\\slash'])
      expect(await kv.list('\u{1F600}')).toEqual([])
    })

    it('updates a missing key from undefined, and a present one from its value, resolving the new value', async () => {
      const kv = await fresh()
      expect(await kv.update<number>('n', current => (current ?? 0) + 1)).toBe(1)
      expect(await kv.update<number>('n', current => (current ?? 0) + 10)).toBe(11)
      expect(await kv.get('n')).toBe(11)
      expect(await kv.update<string[]>('list', current => [...(current ?? []), 'a'])).toEqual(['a'])
    })

    it('counts fifty concurrent updates to exactly fifty', async () => {
      const kv = await fresh()
      await Promise.all(Array.from({ length: 50 }, () => kv.update<number>('counter', current => (current ?? 0) + 1)))
      expect(await kv.get('counter')).toBe(50)
    })

    it('keeps updates of different keys independent, and a set between two updates in order', async () => {
      const kv = await fresh()
      const results = await Promise.all([
        kv.update<number>('a', current => (current ?? 0) + 1),
        kv.set('a', 100),
        kv.update<number>('a', current => (current ?? 0) + 1),
        kv.update<number>('b', current => (current ?? 0) + 5),
      ])
      expect(results[0]).toBe(1)
      expect(results[2]).toBe(101)
      expect(await kv.get('a')).toBe(101)
      expect(await kv.get('b')).toBe(5)
    })

    it('leaves the value as it was when the update callback throws, and rejects with its error', async () => {
      const kv = await fresh()
      await kv.set('k', 'before')
      const failure = new Error('stop')
      await expect(kv.update('k', () => { throw failure })).rejects.toBe(failure)
      expect(await kv.get('k')).toBe('before')
      await expect(kv.update('absent', () => { throw failure })).rejects.toBe(failure)
      expect(await kv.get('absent')).toBeUndefined()
    })

    it('leaves the value as it was when the update returns something that is not JSON', async () => {
      const kv = await fresh()
      await kv.set('k', 'before')
      await expect(kv.update('k', () => undefined as never)).rejects.toThrow(TypeError)
      await expect(kv.update('k', () => Number.NaN as never)).rejects.toThrow(TypeError)
      expect(await kv.get('k')).toBe('before')
    })

    it('rejects an update callback that returns a promise, with a message that says what to do, and keeps the value', async () => {
      const kv = await fresh()
      await kv.set('k', 1)
      const asynchronous = (async () => 2) as unknown as (current: number | undefined) => number
      await expect(kv.update<number>('k', asynchronous)).rejects.toThrow(/synchronous/u)
      expect(await kv.get('k')).toBe(1)
      await kv.update<number>('k', current => (current ?? 0) + 1)
      expect(await kv.get('k')).toBe(2)
    })

    it('refuses an empty or non-string key on every call, and writes nothing', async () => {
      const kv = await fresh()
      for (const key of ['', 1, null, undefined, {}] as unknown as string[]) {
        await expect(kv.get(key)).rejects.toThrow(TypeError)
        await expect(kv.set(key, 1)).rejects.toThrow(TypeError)
        await expect(kv.update(key, () => 1)).rejects.toThrow(TypeError)
        await expect(kv.delete(key)).rejects.toThrow(TypeError)
      }
      expect(await kv.list()).toEqual([])
    })

    it('refuses a value that is not JSON with a TypeError, and writes nothing', async () => {
      const kv = await fresh()
      const circular: Record<string, unknown> = {}
      circular.self = circular
      for (const value of [undefined, () => 1, Symbol('s'), 1n, Number.NaN, Number.POSITIVE_INFINITY, circular, { deep: [Number.NEGATIVE_INFINITY] }]) {
        await expect(kv.set('k', value), String(value)).rejects.toThrow(TypeError)
      }
      expect(await kv.list()).toEqual([])
      await kv.set('k', 'kept')
      await expect(kv.set('k', undefined)).rejects.toThrow(TypeError)
      expect(await kv.get('k')).toBe('kept')
    })

    it('hands out copies: changing what get returned, or the value after set, changes nothing stored', async () => {
      const kv = await fresh()
      const original = { list: [1, 2], nested: { n: 1 } }
      await kv.set('k', original)
      original.list.push(3)
      const first = await kv.get<typeof original>('k')
      expect(first).toEqual({ list: [1, 2], nested: { n: 1 } })
      first!.nested.n = 99
      expect(await kv.get('k')).toEqual({ list: [1, 2], nested: { n: 1 } })
      const updated = await kv.update<typeof original>('k', current => {
        current!.list.push(4)
        return current!
      })
      updated.list.push(5)
      expect(await kv.get('k')).toEqual({ list: [1, 2, 4], nested: { n: 1 } })
    })

    it('stores a value of a megabyte', async () => {
      const kv = await fresh()
      const big = 'x'.repeat(1024 * 1024)
      await kv.set('big', { big })
      expect((await kv.get<{ big: string }>('big'))?.big.length).toBe(big.length)
    })

    it('keeps what was written across close and reopen, and keeps a deleted key deleted', async () => {
      const first = track(await open())
      await first.kv.set('a', { n: 1 })
      await first.kv.set('b', 'two')
      await first.kv.update<number>('count', current => (current ?? 0) + 1)
      await first.kv.set('gone', 1)
      await first.kv.delete('gone')
      const second = track(await first.reopen())
      expect(await second.kv.list()).toEqual(['a', 'b', 'count'])
      expect(await second.kv.get('a')).toEqual({ n: 1 })
      expect(await second.kv.get('count')).toBe(1)
      expect(await second.kv.get('gone')).toBeUndefined()
    })

    it('rejects calls after close, and closing twice does nothing', async () => {
      const subject = track(await open())
      await subject.kv.set('k', 1)
      await subject.close()
      await subject.close()
      await expect(subject.kv.get('k')).rejects.toThrow()
      await expect(subject.kv.set('k', 2)).rejects.toThrow()
    })

    it('waits for writes still in flight when it closes', async () => {
      const subject = track(await open())
      const writes = Array.from({ length: 20 }, (_, index) => subject.kv.set(`k${String(index).padStart(2, '0')}`, index))
      await subject.close()
      await Promise.all(writes)
      const again = track(await subject.reopen())
      expect(await again.kv.list()).toHaveLength(20)
    })
  })
}
