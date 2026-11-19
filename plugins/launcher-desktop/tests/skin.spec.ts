import { describe, expect, it } from 'vitest'
import { isDarkColor, RAIL_KEY, readRail, readSkin, saveRail, saveSkin, SKIN_KEY } from '../src/client/skin.ts'

const store = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [[SKIN_KEY, initial]])
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, data }
}

describe('the skin choice', () => {
  it('is ACRYL ADE\'s unless the site skin was chosen, and a bad or missing store gives the default', () => {
    expect(readSkin(store())).toBe('ade')
    expect(readSkin(store('site'))).toBe('site')
    expect(readSkin(store('neon'))).toBe('ade')
    expect(readSkin({ getItem: () => { throw new Error('blocked') } })).toBe('ade')
  })

  it('is remembered, and a store that refuses is not an error', () => {
    const memory = store()
    saveSkin('site', memory)
    expect(memory.data.get(SKIN_KEY)).toBe('site')
    expect(() => { saveSkin('ade', { setItem: () => { throw new Error('quota') } }) }).not.toThrow()
  })
})

describe('isDarkColor', () => {
  it('reads hex and rgb, and says nothing for what it cannot read', () => {
    expect(isDarkColor('#151517')).toBe(true)
    expect(isDarkColor(' #fff ')).toBe(false)
    expect(isDarkColor('rgb(21, 21, 23)')).toBe(true)
    expect(isDarkColor('rgba(255,255,255,.9)')).toBe(false)
    expect(isDarkColor('var(--x)')).toBeUndefined()
    expect(isDarkColor(undefined)).toBeUndefined()
  })
})

describe('the sidebar rail choice', () => {
  it('is expanded unless it was collapsed, is remembered, and survives a store that refuses', () => {
    const memory = { data: new Map<string, string>(), getItem(key: string) { return this.data.get(key) ?? null }, setItem(key: string, value: string) { this.data.set(key, value) } }
    expect(readRail(memory)).toBe(false)
    saveRail(true, memory)
    expect(memory.data.get(RAIL_KEY)).toBe('1')
    expect(readRail(memory)).toBe(true)
    expect(readRail({ getItem: () => { throw new Error('blocked') } })).toBe(false)
    expect(() => { saveRail(true, { setItem: () => { throw new Error('quota') } }) }).not.toThrow()
  })
})
