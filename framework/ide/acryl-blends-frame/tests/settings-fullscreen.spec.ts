// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { SETTINGS_FULL_ATTRIBUTE, markSettingsFull, readSettingsFull, writeSettingsFull } from '../src/client/settings-fullscreen.ts'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('the Settings full screen choice', () => {
  it('is remembered by the browser, and normal size is the start', () => {
    const store = memory()
    expect(readSettingsFull(store)).toBe(false)
    writeSettingsFull(true, store)
    expect(readSettingsFull(store)).toBe(true)
    writeSettingsFull(false, store)
    expect(readSettingsFull(store)).toBe(false)
  })

  it('works without a storage (blocked or missing) and when the storage throws', () => {
    expect(readSettingsFull(undefined)).toBe(false)
    expect(() => { writeSettingsFull(true, undefined) }).not.toThrow()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readSettingsFull(broken)).toBe(false)
    expect(() => { writeSettingsFull(true, broken) }).not.toThrow()
  })

  it('marks and unmarks the body the styles read', () => {
    const body = document.createElement('body')
    markSettingsFull(true, body)
    expect(body.hasAttribute(SETTINGS_FULL_ATTRIBUTE)).toBe(true)
    markSettingsFull(false, body)
    expect(body.hasAttribute(SETTINGS_FULL_ATTRIBUTE)).toBe(false)
  })
})
