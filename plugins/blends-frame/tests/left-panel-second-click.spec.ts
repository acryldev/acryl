// Save point and New open a text field; clicking the same button again with text typed submits it, as Enter does (owner 2026-11-26).
import { expect, it } from 'vitest'
import { secondClick } from '../src/client/field-button.ts'

it('a second click submits what was typed, and only opens or closes the field when nothing was', () => {
  expect(secondClick('712')).toBe('submit')
  expect(secondClick('  fix the pause menu ')).toBe('submit')
  expect(secondClick('')).toBe('toggle')
  expect(secondClick('   ')).toBe('toggle')
  expect(secondClick(undefined)).toBe('toggle')
})
