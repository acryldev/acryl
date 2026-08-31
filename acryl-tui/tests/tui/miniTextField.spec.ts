import { describe, expect, it } from 'vitest'
import { emptyMiniTextField, miniTextFieldInput } from '../../src/tui/miniTextField.js'

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
