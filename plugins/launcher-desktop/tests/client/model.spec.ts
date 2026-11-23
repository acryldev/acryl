/** The folder a typed app name makes: what `acryl new` and npm accept, from whatever a person types. */

import { describe, expect, it } from 'vitest'
import { folderName } from '../../src/client/model.ts'

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
