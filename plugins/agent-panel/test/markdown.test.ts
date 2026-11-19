import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInline, parseMarkdown, safeHref } from '../client/markdown.ts'

test('headings, paragraphs, lists, fences and quotes become blocks', () => {
  const blocks = parseMarkdown(
    '## Plan\nFirst line\nsecond line\n\n- one\n- two **bold**\n\n1. a\n2. b\n\n```ts\nconst x = 1\n```\n> quoted\n> more',
  )
  assert.deepEqual(
    blocks.map((block) => block.type),
    ['heading', 'paragraph', 'list', 'list', 'code', 'quote'],
  )
  const [heading, paragraph, bullets, numbers, code, quote] = blocks
  assert.deepEqual(heading, {
    type: 'heading',
    level: 2,
    children: [{ type: 'text', text: 'Plan' }],
  })
  assert.deepEqual(paragraph, {
    type: 'paragraph',
    children: [{ type: 'text', text: 'First line\nsecond line' }],
  })
  assert.equal(bullets?.type === 'list' && bullets.ordered, false)
  assert.equal(bullets?.type === 'list' && bullets.items.length, 2)
  assert.equal(numbers?.type === 'list' && numbers.ordered, true)
  assert.deepEqual(code, { type: 'code', language: 'ts', text: 'const x = 1' })
  assert.deepEqual(quote, { type: 'quote', children: [{ type: 'text', text: 'quoted\nmore' }] })
})

test('inline code, bold, italic and links; an opener with no closer is text', () => {
  assert.deepEqual(
    parseInline('use `npm test` and **be careful** with *this* [docs](https://example.com/a)'),
    [
      { type: 'text', text: 'use ' },
      { type: 'code', text: 'npm test' },
      { type: 'text', text: ' and ' },
      { type: 'strong', children: [{ type: 'text', text: 'be careful' }] },
      { type: 'text', text: ' with ' },
      { type: 'em', children: [{ type: 'text', text: 'this' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://example.com/a', children: [{ type: 'text', text: 'docs' }] },
    ],
  )
  assert.deepEqual(parseInline('2 * 3 and **open and `tick'), [
    { type: 'text', text: '2 * 3 and **open and `tick' },
  ])
  assert.deepEqual(parseInline('snake_case_name stays'), [
    { type: 'text', text: 'snake_case_name stays' },
  ])
})

test('an open fence (the answer is still streaming) shows what it has', () => {
  assert.deepEqual(parseMarkdown('Here:\n```\nline 1\nline 2'), [
    { type: 'paragraph', children: [{ type: 'text', text: 'Here:' }] },
    { type: 'code', language: '', text: 'line 1\nline 2' },
  ])
})

test('HTML in an answer is text, and a link keeps its address only for http, https and mailto', () => {
  const hostile = parseMarkdown(
    '<img src=x onerror=alert(1)> <script>alert(2)</script>\n\n[x](javascript:alert(3)) [y](data:text/html,hi) [z](  https://ok.example/p  ) [m](mailto:a@b.c)',
  )
  assert.deepEqual(hostile[0], {
    type: 'paragraph',
    children: [{ type: 'text', text: '<img src=x onerror=alert(1)> <script>alert(2)</script>' }],
  })
  const second = hostile[1]
  assert.ok(second?.type === 'paragraph')
  const links = second.children.filter((node) => node.type === 'link')
  assert.deepEqual(
    links.map((node) => (node.type === 'link' ? node.href : 'x')),
    [undefined, undefined, 'https://ok.example/p', 'mailto:a@b.c'],
  )
  assert.equal(safeHref('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM')
  assert.equal(safeHref('https://a b'), undefined)
  assert.equal(safeHref('//evil.example'), undefined)
  assert.equal(safeHref('/relative'), undefined)
  assert.equal(safeHref('JaVaScRiPt:alert(1)'), undefined)
})
