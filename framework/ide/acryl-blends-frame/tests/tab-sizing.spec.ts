/** The tab strip's sizing: one tab keeps its full label, several share the panel, and only a crowd that cannot fit the minimum scrolls. */

import { describe, expect, it } from 'vitest'
import { tabSizing } from '../src/client/tab-sizing.ts'

describe("the tab strip's sizing", () => {
  it('gives one tab its full label up to the maximum, kind and all', () => {
    expect(tabSizing(396, 1)).toEqual({ width: 168, scroll: false, kind: true })
  })

  it('shares the 412px panel among five tabs without scrolling, dropping the kind', () => {
    // (396 - 26 for the + - four 2px gaps) / 5 = 72.4, the minimum.
    expect(tabSizing(396, 5)).toEqual({ width: 72, scroll: false, kind: false })
  })

  it('keeps the minimum and scrolls when the tabs cannot fit', () => {
    expect(tabSizing(396, 8)).toEqual({ width: 72, scroll: true, kind: false })
  })

  it('caps a wide strip at the maximum rather than stretching one label', () => {
    expect(tabSizing(1200, 3)).toEqual({ width: 168, scroll: false, kind: true })
  })

  it('has a sane answer with no tabs, so the + keeps its edge', () => {
    expect(tabSizing(396, 0)).toEqual({ width: 168, scroll: false, kind: true })
  })
})
