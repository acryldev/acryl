/** Finding web addresses in a line of terminal output, so they can be clicked. Pure text rules. */

export interface TerminalLink {
  /** Zero-based start (inclusive) and end (exclusive) columns in the line. */
  readonly start: number
  readonly end: number
  readonly url: string
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`\\^{|}]+/g
/** Sentence punctuation that follows a link but is not part of it. */
const TRAILING = /[.,;:!?)\]}'"]+$/

/** @returns the http and https addresses in `line`, without trailing punctuation, in order. */
export function findLinks(line: string): TerminalLink[] {
  const links: TerminalLink[] = []
  for (const match of line.matchAll(URL_PATTERN)) {
    const raw = match[0]
    let url = raw.replace(TRAILING, '')
    // A closing bracket belongs to the link when the link opened one (a wiki-style address).
    const count = (char: string): number => url.split(char).length - 1
    if (raw.length > url.length && raw[url.length] === ')' && count('(') > count(')')) url += ')'
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    } catch {
      continue
    }
    const start = match.index
    links.push({ start, end: start + url.length, url })
  }
  return links
}
