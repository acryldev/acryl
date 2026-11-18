/**
 * A small, safe Markdown for the agent's answers. The parser turns text into a tree of blocks and inlines; nothing in it is HTML: the panel builds elements from the tree with
 * `createElement` and `textContent`, so an answer can never put markup, a script or an event handler into the page. A link keeps its address only for `http:`, `https:` and `mailto:`.
 * What it knows: headings, paragraphs, fenced code, bullet and numbered lists, block quotes, and `code`, **bold**, *italic*, [links](https://...) inside a line.
 */

export type Inline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly Inline[] }
  | { readonly type: 'em'; readonly children: readonly Inline[] }
  | {
      readonly type: 'link'
      readonly href: string | undefined
      readonly children: readonly Inline[]
    }

export type Block =
  | { readonly type: 'heading'; readonly level: number; readonly children: readonly Inline[] }
  | { readonly type: 'paragraph'; readonly children: readonly Inline[] }
  | { readonly type: 'code'; readonly language: string; readonly text: string }
  | {
      readonly type: 'list'
      readonly ordered: boolean
      readonly items: readonly (readonly Inline[])[]
    }
  | { readonly type: 'quote'; readonly children: readonly Inline[] }

const SAFE_LINK = /^(?:https?:\/\/|mailto:)/iu

/** The address of a link if it is one the panel will open, else nothing (a `javascript:` or `data:` address is shown as text). */
export function safeHref(href: string): string | undefined {
  const trimmed = href.trim()
  return SAFE_LINK.test(trimmed) && !/[\s<>"]/u.test(trimmed) ? trimmed : undefined
}

/** Inline syntax inside one line or paragraph. An opener with no closer is plain text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let plain = ''
  const flush = (): void => {
    if (plain !== '') out.push({ type: 'text', text: plain })
    plain = ''
  }
  let at = 0
  while (at < text.length) {
    const char = text[at] as string
    if (char === '`') {
      const end = text.indexOf('`', at + 1)
      if (end > at + 1) {
        flush()
        out.push({ type: 'code', text: text.slice(at + 1, end) })
        at = end + 1
        continue
      }
    } else if (char === '*' && text[at + 1] === '*') {
      const end = text.indexOf('**', at + 2)
      if (end > at + 2) {
        flush()
        out.push({ type: 'strong', children: parseInline(text.slice(at + 2, end)) })
        at = end + 2
        continue
      }
    } else if (
      (char === '*' || char === '_') &&
      text[at + 1] !== ' ' &&
      (at === 0 || !/\w/u.test(text[at - 1] as string))
    ) {
      const end = text.indexOf(char, at + 1)
      if (end > at + 1 && text[end - 1] !== ' ' && !/\w/u.test(text[end + 1] ?? ' ')) {
        flush()
        out.push({ type: 'em', children: parseInline(text.slice(at + 1, end)) })
        at = end + 1
        continue
      }
    } else if (char === '[') {
      const close = text.indexOf('](', at + 1)
      const end = close === -1 ? -1 : text.indexOf(')', close + 2)
      if (close > at + 1 && end > close) {
        flush()
        out.push({
          type: 'link',
          href: safeHref(text.slice(close + 2, end)),
          children: parseInline(text.slice(at + 1, close)),
        })
        at = end + 1
        continue
      }
    }
    plain += char
    at += 1
  }
  flush()
  return out
}

/** Blocks of a whole answer. A fence that is still open (the answer is streaming) shows what it has so far. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  const endParagraph = (): void => {
    if (paragraph.length > 0)
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] as string
    const fence = /^\s*```\s*([\w+-]*)\s*$/u.exec(line)
    if (fence) {
      endParagraph()
      const body: string[] = []
      for (at += 1; at < lines.length && !/^\s*```\s*$/u.test(lines[at] as string); at += 1)
        body.push(lines[at] as string)
      blocks.push({ type: 'code', language: fence[1] ?? '', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(line)
    if (heading) {
      endParagraph()
      blocks.push({
        type: 'heading',
        level: (heading[1] as string).length,
        children: parseInline(heading[2] as string),
      })
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/u.exec(line)
    const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/u.exec(line)
    if (bullet || numbered) {
      endParagraph()
      const ordered = numbered !== null
      const items: Inline[][] = []
      for (; at < lines.length; at += 1) {
        const item = (ordered ? /^\s*\d{1,3}[.)]\s+(.*)$/u : /^\s*[-*+]\s+(.*)$/u).exec(
          lines[at] as string,
        )
        if (!item) break
        items.push(parseInline(item[1] as string))
      }
      at -= 1
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const quote = /^\s*>\s?(.*)$/u.exec(line)
    if (quote) {
      endParagraph()
      const quoted: string[] = []
      for (; at < lines.length; at += 1) {
        const next = /^\s*>\s?(.*)$/u.exec(lines[at] as string)
        if (!next) break
        quoted.push(next[1] as string)
      }
      at -= 1
      blocks.push({ type: 'quote', children: parseInline(quoted.join('\n')) })
      continue
    }
    if (line.trim() === '') endParagraph()
    else paragraph.push(line)
  }
  endParagraph()
  return blocks
}

/** Build the elements of a parsed answer. Only `createElement`, `textContent` and attributes set here: no HTML string reaches the page. */
export function renderMarkdown(source: string, document: Document): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const inline = (parent: Node, nodes: readonly Inline[]): void => {
    for (const node of nodes) {
      if (node.type === 'text') parent.appendChild(document.createTextNode(node.text))
      else if (node.type === 'code') {
        const code = document.createElement('code')
        code.textContent = node.text
        parent.appendChild(code)
      } else if (node.type === 'strong' || node.type === 'em') {
        const element = document.createElement(node.type)
        inline(element, node.children)
        parent.appendChild(element)
      } else if (node.href === undefined) {
        inline(parent, node.children)
      } else {
        const anchor = document.createElement('a')
        anchor.href = node.href
        anchor.target = '_blank'
        anchor.rel = 'noopener noreferrer'
        inline(anchor, node.children)
        parent.appendChild(anchor)
      }
    }
  }
  for (const block of parseMarkdown(source)) {
    if (block.type === 'code') {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = block.text
      pre.appendChild(code)
      fragment.appendChild(pre)
    } else if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul')
      for (const item of block.items) {
        const li = document.createElement('li')
        inline(li, item)
        list.appendChild(li)
      }
      fragment.appendChild(list)
    } else {
      const element = document.createElement(
        block.type === 'heading'
          ? `h${String(Math.min(block.level + 2, 6))}`
          : block.type === 'quote'
            ? 'blockquote'
            : 'p',
      )
      inline(element, block.children)
      fragment.appendChild(element)
    }
  }
  return fragment
}
