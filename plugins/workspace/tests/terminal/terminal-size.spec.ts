import { describe, expect, it } from 'vitest'
import { estimateTerminalSize } from '../../src/client/terminal/terminal-size.ts'

describe('estimateTerminalSize', () => {
  it('estimates columns and rows from the area', () => {
    expect(estimateTerminalSize(1000, 700)).toEqual({ cols: 125, rows: 42 })
  })
  it('caps at what the Host accepts', () => {
    expect(estimateTerminalSize(9000, 9000)).toEqual({ cols: 500, rows: 200 })
  })
  it('gives no guess for an unknown or tiny area', () => {
    expect(estimateTerminalSize(0, 0)).toBeUndefined()
    expect(estimateTerminalSize(100, 100)).toBeUndefined()
    expect(estimateTerminalSize(Number.NaN, 500)).toBeUndefined()
  })
})
