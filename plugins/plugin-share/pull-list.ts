/**
 * A group's list of plugins: one source per line, as each person sends it (`github:<owner>/<repo>@<version>@sha256:<digest>`, or the whole line
 * `plugin publish` prints). The list is text a person or a group keeps (a file in the app, a gist, a file in a repository), so reading it is
 * forgiving about comments, blank lines and the pasted command, and strict about anything else: a line that is not one source is named, not guessed.
 */

/** A list is a few lines of text: anything larger is not a list of plugins. */
export const LIST_MAX_BYTES = 64 * 1024

/** More sources than a group has people is a mistake, not a workshop. */
export const LIST_MAX_SOURCES = 100

/** The command a person pastes from `plugin publish`: only its source is kept. */
const PULL_COMMAND = /^(?:npm run acryl --\s+)?plugin pull\s+/u

/** A `#` at the start of a line or after a space begins a comment; a source never holds one there. */
const COMMENT = /(?:^|\s)#.*$/u

export interface PullListLine {
  /** Its line in the list, from 1, so a problem is easy to find. */
  readonly line: number
  readonly source: string
}

export interface ParsedPullList {
  /** The sources in their order, each once. */
  readonly sources: readonly PullListLine[]
  /** Lines that are not one source, each with what is wrong. */
  readonly problems: readonly string[]
}

/** The sources of a list, in order and without repeats, and the lines that are not a source. */
export function parsePullList(text: string): ParsedPullList {
  const sources: PullListLine[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  text.split(/\r?\n/u).forEach((raw, index) => {
    const line = index + 1
    const value = raw.replace(COMMENT, '').trim().replace(PULL_COMMAND, '').trim()
    if (value === '') return
    if (/\s/u.test(value)) {
      problems.push(
        `line ${String(line)} holds more than one word ("${value}"); write one source per line`,
      )
      return
    }
    if (seen.has(value)) return
    seen.add(value)
    sources.push({ line, source: value })
  })
  if (sources.length > LIST_MAX_SOURCES)
    problems.push(
      `the list has ${String(sources.length)} sources; a list holds at most ${String(LIST_MAX_SOURCES)}`,
    )
  return { sources, problems }
}

/** Where a list is read from: an https address, or a file (relative to the app folder). */
export type PullListLocation =
  | { readonly kind: 'address'; readonly url: string }
  | { readonly kind: 'file'; readonly path: string }

/** @returns undefined for something that is neither (an http: address, a github: source): the caller names what a list may be. */
export function pullListLocation(from: string): PullListLocation | undefined {
  const value = from.trim()
  if (value === '') return undefined
  if (/^https:\/\//iu.test(value)) return { kind: 'address', url: value }
  // A drive letter (C:\...) is a path; any other scheme is not a place a list is read from.
  if (/^[a-z][a-z0-9+.-]+:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)) return undefined
  return { kind: 'file', path: value }
}
