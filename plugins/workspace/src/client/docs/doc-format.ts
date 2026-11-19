/**
 * Dependency-free, safe markdown for the Doc tile: headings, paragraphs, bullet and numbered lists, block
 * quotes, fenced code, tables, rules, and inline bold, italic, code and links. Blocks and inline segments are
 * data the component renders as real elements (never `dangerouslySetInnerHTML`), and a link only becomes a
 * link for `http(s)` and `mailto`, so nothing here is an XSS surface. Not a full CommonMark engine; a real
 * library is a legitimate later upgrade with no change to the tile's contract.
 */

export type DocBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly text: string }
  | { readonly kind: 'bullet'; readonly items: readonly string[] }
  | { readonly kind: 'ordered'; readonly items: readonly string[] }
  | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'code'; readonly language: string; readonly text: string }
  | { readonly kind: 'table'; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: 'rule' }
  | { readonly kind: 'paragraph'; readonly text: string }

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(cell => cell.trim())
}

const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export function parseDoc(text: string): readonly DocBlock[] {
  const blocks: DocBlock[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let bullet: string[] = []
  let ordered: string[] = []
  let quote: string[] = []
  const flush = (): void => {
    if (bullet.length > 0) blocks.push({ kind: 'bullet', items: bullet })
    if (ordered.length > 0) blocks.push({ kind: 'ordered', items: ordered })
    if (quote.length > 0) blocks.push({ kind: 'quote', text: quote.join(' ') })
    bullet = []
    ordered = []
    quote = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = raw.trimEnd()
    const fence = /^```\s*([\w+#.-]*)\s*$/.exec(line.trimStart())
    if (fence !== null) {
      flush()
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test((lines[index] ?? '').trimStart())) {
        body.push(lines[index] ?? '')
        index += 1
      }
      blocks.push({ kind: 'code', language: fence[1] ?? '', text: body.join('\n') })
      continue
    }
    const next = lines[index + 1]
    if (line.includes('|') && next !== undefined && next.includes('|') && TABLE_RULE.test(next)) {
      flush()
      const header = splitRow(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim() !== '') {
        rows.push(splitRow(lines[index] ?? ''))
        index += 1
      }
      index -= 1
      blocks.push({ kind: 'table', header, rows })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const item = /^\s*[-*+]\s+(.*)$/.exec(line)
    const number = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const quoted = /^>\s?(.*)$/.exec(line)
    if (heading !== null) {
      flush()
      blocks.push({ kind: 'heading', level: (heading[1] ?? '#').length as 1 | 2 | 3 | 4 | 5 | 6, text: heading[2] ?? '' })
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'rule' })
    } else if (item !== null) {
      if (ordered.length > 0 || quote.length > 0) flush()
      bullet.push(item[1] ?? '')
    } else if (number !== null) {
      if (bullet.length > 0 || quote.length > 0) flush()
      ordered.push(number[1] ?? '')
    } else if (quoted !== null) {
      if (bullet.length > 0 || ordered.length > 0) flush()
      quote.push(quoted[1] ?? '')
    } else if (line.trim().length === 0) {
      flush()
    } else {
      flush()
      blocks.push({ kind: 'paragraph', text: line })
    }
  }
  flush()
  return blocks
}

/** Inline markup as plain data. `code` and `href` appear only when set, so plain text stays `{ text, bold, italic }`. */
export interface InlineSegment {
  readonly text: string
  readonly bold: boolean
  readonly italic: boolean
  readonly code?: true
  readonly href?: string
}

/** A link target that is safe to put in an anchor: http, https or mailto. Anything else is shown as text. */
export function safeHref(target: string): string | undefined {
  const trimmed = target.trim()
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(trimmed) ? trimmed : undefined
}

export function parseInline(text: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), bold: false, italic: false })
    if (match[1] !== undefined) segments.push({ text: match[1], bold: false, italic: false, code: true })
    else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3])
      segments.push(href === undefined
        ? { text: match[2], bold: false, italic: false }
        : { text: match[2], bold: false, italic: false, href })
    } else if (match[4] !== undefined) segments.push({ text: match[4], bold: true, italic: false })
    else if (match[5] !== undefined) segments.push({ text: match[5], bold: false, italic: true })
    cursor = pattern.lastIndex
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false, italic: false })
  return segments
}
