import { describe, expect, it } from 'vitest'
import { isDarkColor, readSkin, saveSkin, SKIN_KEY } from '../src/client/skin.ts'

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
