import { describe, expect, it } from 'vitest'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField } from '../../src/tui/miniTextField.js'

describe('miniTextFieldInput', () => {
  it('inserts a printable character at the cursor', () => {
    const next = miniTextFieldInput(emptyMiniTextField(), 'a')
    expect(next).toEqual({ value: 'a', cursor: 1 })
  })

  it('inserts a bracketed paste atomically at the cursor', () => {
    const start = emptyMiniTextField('x')
    const next = miniTextFieldInput(start, '\x1b[200~sk-ant-abc\x1b[201~')
    expect(next).toEqual({ value: 'xsk-ant-abc', cursor: 11 })
  })

  it('collapses line breaks in pasted text (single-line field)', () => {
    const next = miniTextFieldInput(emptyMiniTextField(), '\x1b[200~line1\nline2\rline3\x1b[201~')
    expect(next).toEqual({ value: 'line1line2line3', cursor: 15 })
  })

  it('is a no-op for an empty bracketed paste', () => {
    const start = emptyMiniTextField('abc')
    const next = miniTextFieldInput(start, '\x1b[200~\x1b[201~')
    expect(next).toEqual({ value: 'abc', cursor: 3 })
  })

  it('still ignores a raw escape sequence (not a paste)', () => {
    const next = miniTextFieldInput(emptyMiniTextField(), '\x1b[1;2A')
    expect(next).toBeUndefined()
  })
})

describe('renderMiniTextField masking', () => {
  it('renders the value unmasked when no mask is given', () => {
    expect(renderMiniTextField(emptyMiniTextField('hello'), false)).toBe('hello')
  })

  it('reveals first/last 4 characters of a long value while masking the middle', () => {
    const state = emptyMiniTextField('sk-proj-abcdefghijklmnopqrstuvwxyz9sZ4')
    expect(renderMiniTextField(state, false, '•')).toBe('sk-p••••••••••••••••••••••••••••••9sZ4')
  })

  it('keeps the masked display the same length as the real value (cursor math depends on it)', () => {
    const state = emptyMiniTextField('sk-proj-abcdefghijklmnopqrstuvwxyz9sZ4')
    expect(renderMiniTextField(state, false, '•').length).toBe(state.value.length)
  })

  it('never renders the value verbatim once masked, for a realistic secret', () => {
    const value = 'sk-live-51H8xyzSecretValueThatMustNeverAppearVerbatim'
    expect(renderMiniTextField(emptyMiniTextField(value), false, '•')).not.toContain(value)
  })

  it('masks a short value down to its first/last single character', () => {
    expect(renderMiniTextField(emptyMiniTextField('abcdefgh'), false, '•')).toBe('a••••••h')
  })

  it('masks a value of 2 or fewer characters entirely', () => {
    expect(renderMiniTextField(emptyMiniTextField('ab'), false, '•')).toBe('••')
  })

  it('renders nothing for an empty masked value', () => {
    expect(renderMiniTextField(emptyMiniTextField(''), false, '•')).toBe('')
  })
})
