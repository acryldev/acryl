import { describe, expect, it } from 'vitest'
import { DEFAULT_LAST_TAB, LAST_TAB_KEY, readLastTab, writeLastTab } from '../../src/client/tabs/last-tab.ts'

const store = (initial?: string) => {
  let value = initial
  return { getItem: (key: string) => (key === LAST_TAB_KEY ? value ?? null : null), setItem: (_key: string, next: string) => { value = next } }
}

describe('last tab', () => {
  it('starts as a terminal and remembers an agent or a surface', () => {
    const s = store()
    expect(readLastTab(s)).toEqual(DEFAULT_LAST_TAB)
    writeLastTab(s, { kind: 'agent', id: 'claude', label: 'Claude' })
    expect(readLastTab(s)).toEqual({ kind: 'agent', id: 'claude', label: 'Claude' })
    writeLastTab(s, { kind: 'surface', surface: 'kanban' })
    expect(readLastTab(s)).toEqual({ kind: 'surface', surface: 'kanban' })
  })
  it('falls back to the default for anything damaged or unknown', () => {
    for (const bad of ['{nope', '3', '{"kind":"agent"}', '{"kind":"surface","surface":"rm"}', `{"kind":"agent","id":"${'x'.repeat(40)}","label":"x"}`]) {
      expect(readLastTab(store(bad))).toEqual(DEFAULT_LAST_TAB)
    }
    expect(readLastTab(undefined)).toEqual(DEFAULT_LAST_TAB)
  })
})
