import { describe, expect, it, vi } from 'vitest'
import { createCell, createDerived } from '../src/cell.ts'

describe('cells', () => {
  it('holds a value, notifies on change with the previous value, and ignores a set to an equal value', () => {
    const cell = createCell('a.b', 1)
    const seen: Array<[number, number]> = []
    cell.subscribe((value, previous) => seen.push([value, previous]))
    cell.set(2)
    cell.set(2)
    cell.update(n => n + 1)
    expect(cell.get()).toBe(3)
    expect(seen).toEqual([[2, 1], [3, 2]])
  })

  it('stops notifying after unsubscribe, and unsubscribing twice is harmless', () => {
    const cell = createCell('a', 0)
    const listener = vi.fn()
    const stop = cell.subscribe(listener)
    cell.set(1)
    stop()
    stop()
    cell.set(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('isolates a failing subscriber: the others still run and the error is reported', () => {
    const report = vi.fn()
    const cell = createCell('a', 0, report)
    const after = vi.fn()
    cell.subscribe(() => { throw new Error('boom') })
    cell.subscribe(after)
    cell.set(1)
    expect(after).toHaveBeenCalledWith(1, 0)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('lets a subscriber unsubscribe itself while being notified', () => {
    const cell = createCell('a', 0)
    const calls: number[] = []
    const stop = cell.subscribe(value => { calls.push(value); stop() })
    cell.subscribe(value => calls.push(value * 10))
    cell.set(1)
    cell.set(2)
    expect(calls).toEqual([1, 10, 20])
  })
})

describe('derived cells', () => {
  it('recomputes from its inputs, notifies only when its own value changes, and detaches on dispose', () => {
    const a = createCell('a', 2)
    const b = createCell('b', 3)
    const { cell: sum, dispose } = createDerived('sum', [a, b] as const, (x, y) => x + y)
    const seen: number[] = []
    sum.subscribe(value => seen.push(value))
    expect(sum.get()).toBe(5)
    a.set(10)
    b.set(1)
    expect(seen).toEqual([13, 11])
    const parity = createDerived('parity', [a] as const, x => x % 2 === 0).cell
    const flips: boolean[] = []
    parity.subscribe(value => flips.push(value))
    a.set(12)
    a.set(14)
    expect(flips).toEqual([])
    dispose()
    a.set(100)
    // Detached: it keeps the last value it computed (14 + 1), not 100 + 1.
    expect(sum.get()).toBe(15)
  })
})
