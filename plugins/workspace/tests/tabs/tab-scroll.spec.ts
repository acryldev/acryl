import { describe, expect, it } from 'vitest'
import { hiddenEdges, scrollToReveal, wheelToScroll } from '../../src/client/tabs/tab-scroll.ts'

const g = (scrollLeft: number) => ({ scrollLeft, clientWidth: 400, scrollWidth: 1000 })

describe('hiddenEdges', () => {
  it('reports which side still hides tabs', () => {
    expect(hiddenEdges(g(0))).toEqual({ start: false, end: true })
    expect(hiddenEdges(g(300))).toEqual({ start: true, end: true })
    expect(hiddenEdges(g(600))).toEqual({ start: true, end: false })
    expect(hiddenEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toEqual({ start: false, end: false })
  })
  it('ignores sub-pixel rounding', () => {
    expect(hiddenEdges({ scrollLeft: 0.4, clientWidth: 400, scrollWidth: 400.6 })).toEqual({ start: false, end: false })
  })
})

describe('wheelToScroll', () => {
  it('turns a vertical wheel into a horizontal scroll and leaves horizontal gestures alone', () => {
    expect(wheelToScroll(0, 40)).toBe(40)
    expect(wheelToScroll(2, -30)).toBe(-30)
    expect(wheelToScroll(50, 3)).toBeNull()
    expect(wheelToScroll(0, 0)).toBeNull()
  })
})

describe('scrollToReveal', () => {
  it('does nothing when the tab is already visible', () => {
    expect(scrollToReveal(g(100), 200, 120)).toBeNull()
  })
  it('scrolls left to a tab hidden on the left, never below zero', () => {
    expect(scrollToReveal(g(300), 100, 120)).toBe(76)
    expect(scrollToReveal(g(300), 10, 120)).toBe(0)
  })
  it('scrolls right to a tab hidden on the right', () => {
    expect(scrollToReveal(g(0), 500, 120)).toBe(500 + 120 + 24 - 400)
  })
})
