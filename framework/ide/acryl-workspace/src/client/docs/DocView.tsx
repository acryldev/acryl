/** Renders parsed markdown blocks as real elements. Shared by the scratch Doc tile and the file-backed one. */

import { Fragment, type ReactNode } from 'react'
import { parseInline, type DocBlock, type InlineSegment } from './doc-format.ts'

function inline(text: string): ReactNode {
  return parseInline(text).map(segment, 0)
}

function segment(part: InlineSegment, index: number): ReactNode {
  let node: ReactNode = part.text
  if (part.code === true) node = <code className="dshWorkspaceDocCode">{node}</code>
  if (part.bold) node = <strong>{node}</strong>
  if (part.italic) node = <em>{node}</em>
  if (part.href !== undefined) node = <a href={part.href} target="_blank" rel="noopener noreferrer">{node}</a>
  // eslint-disable-next-line react/no-array-index-key -- inline segments have no stable identity
  return <Fragment key={index}>{node}</Fragment>
}

function Block({ block }: { block: DocBlock }): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${String(block.level)}` as 'h1'
      return <Tag className="dshWorkspaceDocHeading">{inline(block.text)}</Tag>
    }
    case 'bullet':
      return <ul className="dshWorkspaceDocList">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>
    case 'ordered':
      return <ol className="dshWorkspaceDocList">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>
    case 'quote':
      return <blockquote className="dshWorkspaceDocQuote">{inline(block.text)}</blockquote>
    case 'code':
      return <pre className="dshWorkspaceDocPre" data-language={block.language || undefined}><code>{block.text}</code></pre>
    case 'rule':
      return <hr className="dshWorkspaceDocRule" />
    case 'table':
      return (
        <table className="dshWorkspaceDocTable">
          <thead><tr>{block.header.map((cell, i) => <th key={i}>{inline(cell)}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell)}</td>)}</tr>)}</tbody>
        </table>
      )
    case 'paragraph':
      return <p className="dshWorkspaceDocParagraph">{inline(block.text)}</p>
  }
}

export function DocView({ blocks }: { readonly blocks: readonly DocBlock[] }) {
  return <>{blocks.map((block, index) => <Block key={index} block={block} />)}</>
}
