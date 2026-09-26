import { describe, expect, it } from 'vitest'
import { parseDoc, parseInline, safeHref } from '../../src/client/docs/doc-format.ts'

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

describe('parseDoc (spec-file markdown)', () => {
  it('parses fenced code with its language, and keeps markup inside it literal', () => {
    expect(parseDoc('before\n```ts\nconst a = **1**\n```\nafter')).toEqual([
      { kind: 'paragraph', text: 'before' },
      { kind: 'code', language: 'ts', text: 'const a = **1**' },
      { kind: 'paragraph', text: 'after' },
    ])
    expect(parseDoc('```\nunterminated')).toEqual([{ kind: 'code', language: '', text: 'unterminated' }])
  })

  it('parses numbered lists, block quotes, rules and deeper headings', () => {
    expect(parseDoc('1. one\n2) two\n\n> quoted\n> more\n\n---\n#### h4')).toEqual([
      { kind: 'ordered', items: ['one', 'two'] },
      { kind: 'quote', text: 'quoted more' },
      { kind: 'rule' },
      { kind: 'heading', level: 4, text: 'h4' },
    ])
  })

  it('parses pipe tables with a header and rows, and does not mistake a lone pipe line for one', () => {
    expect(parseDoc('| A | B |\n|---|:-:|\n| 1 | 2 |\n| 3 | 4 |\n\ntext')).toEqual([
      { kind: 'table', header: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
      { kind: 'paragraph', text: 'text' },
    ])
    expect(parseDoc('a | b')).toEqual([{ kind: 'paragraph', text: 'a | b' }])
  })

  it('switches between list kinds without merging them, and handles CRLF', () => {
    expect(parseDoc('- a\r\n1. b\r\n')).toEqual([{ kind: 'bullet', items: ['a'] }, { kind: 'ordered', items: ['b'] }])
  })
})

describe('parseInline (code and links)', () => {
  it('marks inline code and keeps its content literal', () => {
    expect(parseInline('run `pnpm **x**` now')).toEqual([
      { text: 'run ', bold: false, italic: false },
      { text: 'pnpm **x**', bold: false, italic: false, code: true },
      { text: ' now', bold: false, italic: false },
    ])
  })

  it('links only http, https and mailto; anything else stays plain text', () => {
    expect(parseInline('[ok](https://example.com/a) [mail](mailto:a@b.c)')).toEqual([
      { text: 'ok', bold: false, italic: false, href: 'https://example.com/a' },
      { text: ' ', bold: false, italic: false },
      { text: 'mail', bold: false, italic: false, href: 'mailto:a@b.c' },
    ])
    for (const target of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', '../x.md', 'file:///etc/passwd']) {
      const parts = parseInline(`[t](${target})`)
      expect(parts[0]).toEqual({ text: 't', bold: false, italic: false })
      expect(parts.every(part => part.href === undefined), target).toBe(true)
    }
    expect(safeHref('https://a.b')).toBe('https://a.b')
    expect(safeHref(' javascript:1')).toBeUndefined()
  })
})
