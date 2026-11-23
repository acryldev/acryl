/** The folder a typed app name makes: what `acryl new` and npm accept, from whatever a person types. */

import { describe, expect, it } from 'vitest'
import { folderName, storeCategories } from '../../src/client/model.ts'

describe('folderName', () => {
  it('makes lower case letters, digits and dashes from any name', () => {
    expect(folderName('ACRYL ADE (EB)')).toBe('acryl-ade-eb')
    expect(folderName('My CRM 2')).toBe('my-crm-2')
    expect(folderName('  Café  Notes!! ')).toBe('cafe-notes')
    expect(folderName('shop')).toBe('shop')
  })

  it('starts with a letter, and is empty when nothing usable is left', () => {
    expect(folderName('2024 plans')).toBe('plans')
    expect(folderName('---')).toBe('')
    expect(folderName('123')).toBe('')
    expect(folderName('')).toBe('')
  })

  it('always gives what the Host accepts', () => {
    for (const text of ['ACRYL ADE (EB)', 'a_b.c', 'Ärger über Öl', 'x--y', '-lead'])
      expect(folderName(text)).toMatch(/^([a-z][a-z0-9-]*)?$/u)
  })
})

describe('storeCategories', () => {
  it('lists only the categories that hold a Blend, in the store order, with their subcategories and counts', () => {
    const blend = (id: string, category: string, subcategory: string, order: number) => ({ id, name: id, version: '', category: '', description: '', origin: 'official' as const, place: { category, subcategory, order } })
    expect(storeCategories([
      blend('a', 'AI', 'ADE', 5), blend('b', 'AI', 'ADE', 5), blend('c', 'AI', 'SDE', 5), blend('d', 'Business', 'CRM', 2),
      { id: 'e', name: 'e', version: '', category: 'notes', description: '', origin: 'community' as const },
    ])).toEqual([
      { name: 'Business', count: 1, subs: [{ name: 'CRM', count: 1 }] },
      { name: 'AI', count: 3, subs: [{ name: 'ADE', count: 2 }, { name: 'SDE', count: 1 }] },
    ])
  })
})
