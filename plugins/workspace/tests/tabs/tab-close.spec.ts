import { describe, expect, it } from 'vitest'
import { tabsToClose } from '../../src/client/tabs/tab-close.ts'

const ids = ['a', 'b', 'c', 'd']

describe('tabsToClose', () => {
  it('closes every other tab, keeping the one the menu was opened on', () => {
    expect(tabsToClose(ids, 'b', 'others')).toEqual(['a', 'c', 'd'])
  })
  it('closes the tabs to the right in order', () => {
    expect(tabsToClose(ids, 'b', 'right')).toEqual(['c', 'd'])
    expect(tabsToClose(ids, 'd', 'right')).toEqual([])
  })
  it('closes nothing for an unknown tab', () => {
    expect(tabsToClose(ids, 'zzz', 'others')).toEqual([])
  })
})
