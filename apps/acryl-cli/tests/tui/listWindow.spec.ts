import { describe, expect, it } from 'vitest'
import { listWindow, visibleRange } from '../../src/tui/listWindow.js'

describe('listWindow', () => {
  it('reserves at least 3 rows even on a very short terminal', () => {
    expect(listWindow(5, 10)).toBe(3)
  })

  it('subtracts chrome from the terminal height', () => {
    expect(listWindow(40, 6)).toBe(34)
  })
})

describe('visibleRange', () => {
  it('shows everything when it already fits', () => {
    expect(visibleRange(5, 2, 10)).toEqual({ start: 0, end: 5 })
  })

  it('centers the window on the selected index', () => {
    expect(visibleRange(100, 50, 10)).toEqual({ start: 45, end: 55 })
  })

  it('clamps the window to the start when selection is near the top', () => {
    expect(visibleRange(100, 0, 10)).toEqual({ start: 0, end: 10 })
  })

  it('clamps the window to the end when selection is near the bottom', () => {
    expect(visibleRange(100, 99, 10)).toEqual({ start: 90, end: 100 })
  })
})
