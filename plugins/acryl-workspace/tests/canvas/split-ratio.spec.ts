import { describe, expect, it } from 'vitest'
import { clampSplit, ratioFromPointer, readSplitRatio, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN, writeSplitRatio } from '../../src/client/canvas/split-ratio.ts'

describe('split ratio', () => {
  it('clamps to the allowed range and treats non-finite input as an even split', () => {
    expect(clampSplit(0.05)).toBe(SPLIT_MIN)
    expect(clampSplit(0.99)).toBe(SPLIT_MAX)
    expect(clampSplit(0.4)).toBe(0.4)
    expect(clampSplit(Number.NaN)).toBe(SPLIT_DEFAULT)
    expect(clampSplit(Infinity)).toBe(SPLIT_DEFAULT)
  })

  it('turns a pointer position into the primary pane share', () => {
    expect(ratioFromPointer(300, 100, 400)).toBe(0.5)
    expect(ratioFromPointer(0, 100, 400)).toBe(SPLIT_MIN)
    expect(ratioFromPointer(900, 100, 400)).toBe(SPLIT_MAX)
    expect(ratioFromPointer(300, 100, 0)).toBe(SPLIT_DEFAULT)
  })

  it('round-trips through storage and survives broken storage', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
    expect(readSplitRatio(storage)).toBe(SPLIT_DEFAULT)
    writeSplitRatio(storage, 0.65)
    expect(readSplitRatio(storage)).toBe(0.65)
    data.set('acryl-workspace:split-ratio', 'garbage')
    expect(readSplitRatio(storage)).toBe(SPLIT_DEFAULT)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readSplitRatio(broken)).toBe(SPLIT_DEFAULT)
    expect(() => { writeSplitRatio(broken, 0.3) }).not.toThrow()
    expect(readSplitRatio(undefined)).toBe(SPLIT_DEFAULT)
  })
})
