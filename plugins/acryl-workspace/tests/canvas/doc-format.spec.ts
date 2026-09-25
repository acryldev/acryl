import { describe, expect, it } from 'vitest'
import { parseDoc, parseInline } from '../../src/client/canvas/doc-format.ts'

describe('parseDoc', () => {
  it('splits headings, bullet runs, and paragraphs into blocks', () => {
    const blocks = parseDoc('# Title\n\nSome text.\n\n- one\n- two\n\nMore text.')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'Some text.' },
      { kind: 'bullet', items: ['one', 'two'] },
      { kind: 'paragraph', text: 'More text.' },
    ])
  })

  it('supports h1 through h3', () => {
    const blocks = parseDoc('# a\n## b\n### c')
    expect(blocks.map(b => b.kind === 'heading' ? b.level : undefined)).toEqual([1, 2, 3])
  })

  it('flushes a trailing bullet run with no following blank line', () => {
    const blocks = parseDoc('- only item')
    expect(blocks).toEqual([{ kind: 'bullet', items: ['only item'] }])
  })
})

describe('parseInline', () => {
  it('splits bold, italic, and plain text segments', () => {
    const segments = parseInline('a **b** c *d* e')
    expect(segments).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'b', bold: true, italic: false },
      { text: ' c ', bold: false, italic: false },
      { text: 'd', bold: false, italic: true },
      { text: ' e', bold: false, italic: false },
    ])
  })

  it('returns one plain segment for text with no markup', () => {
    expect(parseInline('plain')).toEqual([{ text: 'plain', bold: false, italic: false }])
  })
})
