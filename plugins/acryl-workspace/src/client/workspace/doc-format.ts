/**
 * Minimal, dependency-free markdown-ish rendering for the Doc tile: headings, bold/italic, and
 * bullet lists, split into blocks the component renders as real elements (no `dangerouslySetInnerHTML`,
 * so nothing here is an XSS surface). Not a full markdown engine - a real Markdown library is a
 * legitimate future upgrade with no change to the Doc tile's own contract.
 */

export type DocBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'bullet'; readonly items: readonly string[] }
  | { readonly kind: 'paragraph'; readonly text: string }

export function parseDoc(text: string): readonly DocBlock[] {
  const blocks: DocBlock[] = []
  const lines = text.split('\n')
  let bullet: string[] = []
  const flushBullet = (): void => {
    if (bullet.length > 0) {
      blocks.push({ kind: 'bullet', items: bullet })
      bullet = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (heading !== null) {
      flushBullet()
      const level = (heading[1] ?? '#').length as 1 | 2 | 3
      blocks.push({ kind: 'heading', level, text: heading[2] ?? '' })
    } else if (item !== null) {
      bullet.push(item[1] ?? '')
    } else if (line.trim().length === 0) {
      flushBullet()
    } else {
      flushBullet()
      blocks.push({ kind: 'paragraph', text: line })
    }
  }
  flushBullet()
  return blocks
}

/** Inline `**bold**`/`*italic*` split into plain segments - rendered as real <strong>/<em>, never raw HTML. */
export interface InlineSegment {
  readonly text: string
  readonly bold: boolean
  readonly italic: boolean
}

export function parseInline(text: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), bold: false, italic: false })
    if (match[1] !== undefined) segments.push({ text: match[1], bold: true, italic: false })
    else if (match[2] !== undefined) segments.push({ text: match[2], bold: false, italic: true })
    cursor = pattern.lastIndex
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false, italic: false })
  return segments
}
