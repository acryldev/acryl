import { describe, expect, it } from 'vitest'
import { diffLines } from '../../src/client/diff/line-diff.ts'

describe('diffLines', () => {
  it('reports pure context for identical texts', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc')
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' },
    ])
  })

  it('reports a single-line change as remove+add around unchanged context', () => {
    const lines = diffLines('a\nb\nc', 'a\nx\nc')
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'context', text: 'c' },
    ])
  })

  it('reports a pure append as trailing add lines', () => {
    const lines = diffLines('a', 'a\nb\nc')
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'add', text: 'b' },
      { kind: 'add', text: 'c' },
    ])
  })

  it('reports a pure deletion as leading remove lines', () => {
    const lines = diffLines('a\nb\nc', 'a')
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'remove', text: 'c' },
    ])
  })

  it('handles two empty texts', () => {
    expect(diffLines('', '')).toEqual([{ kind: 'context', text: '' }])
  })
})
