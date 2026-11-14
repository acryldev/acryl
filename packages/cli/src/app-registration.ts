/**
 * The two `src/app.ts` edits `acrylblends add` makes for a plugin it mounts (`mount.ts`): an import line after the last plugin import, and a
 * registry entry after `export const registry = {`. An app's own copy of these lines is not the owner's change; the upgrade recognises them,
 * keeps them on the new file it writes, and reports only the owner's other lines.
 */

import { MOUNTED, type Mounted, registrationImport } from './mount.ts'

export { registrationImport }

/** One registration line the framework wrote into `src/app.ts`. */
export interface AppRegistration {
  readonly plugin: Mounted
  readonly kind: 'import' | 'registry'
  /** The line without its line ending. */
  readonly line: string
}

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

/** The registry entry line `mount` writes for one plugin (its indent and comma included). */
export function registrationEntry(plugin: Mounted): string {
  return `  '${plugin.name}': ${plugin.local},`
}

/** Every registration line at the start of `text`, the line ending kept; a line is one registration. */
function registrations(text: string, mounted: readonly Mounted[]): AppRegistration[] {
  const found: AppRegistration[] = []
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const importMatch =
      /^import (?:\* as \w+|\{ \w+ \}) from '\.\.\/plugins\/([^/]+)\/[^']+'$/u.exec(line)
    if (importMatch !== null) {
      const plugin = mounted.find(
        (candidate) => candidate.name === importMatch[1] && registrationImport(candidate) === line,
      )
      if (plugin !== undefined) found.push({ plugin, kind: 'import', line })
      continue
    }
    const entryMatch = /^ {2}'([^']+)': (\w+),$/u.exec(line)
    if (entryMatch !== null) {
      const plugin = mounted.find(
        (candidate) => candidate.name === entryMatch[1] && candidate.local === entryMatch[2],
      )
      if (plugin !== undefined) found.push({ plugin, kind: 'registry', line })
    }
  }
  return found
}

/** The text without the framework's registration lines, and those lines in file order. A line the released template already has is the
 * template's own (agent-panel's import ships with the agent template), never the add command's edit. */
export function stripRegistrations(
  text: string,
  mounted: readonly Mounted[] = MOUNTED,
  template?: string,
): { readonly text: string; readonly edits: readonly AppRegistration[] } {
  const inTemplate = new Set(
    (template ?? '').split('\n').map((raw) => (raw.endsWith('\r') ? raw.slice(0, -1) : raw)),
  )
  const edits = registrations(text, mounted).filter((edit) => !inTemplate.has(edit.line))
  if (edits.length === 0) return { text, edits }
  const wanted = new Set(edits.map((edit) => edit.line))
  const kept = text.split('\n').filter((raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    return !wanted.has(line)
  })
  return { text: kept.join('\n'), edits }
}

/**
 * Put the framework's registration lines back into a template, at the same places `mount` inserts them: every import after the last
 * `../plugins/` import, every registry entry after the `export const registry = {` line. Lines already present are left alone.
 */
export function withRegistrations(text: string, edits: readonly AppRegistration[]): string {
  const eol = eolOf(text)
  let next = text
  const imports = edits.filter(
    (edit) =>
      edit.kind === 'import' &&
      !next.split('\n').some((raw) => (raw.endsWith('\r') ? raw.slice(0, -1) : raw) === edit.line),
  )
  if (imports.length > 0) {
    const last = [...next.matchAll(/^import .* from '\.\.\/plugins\/[^']+'\r?\n/gmu)].at(-1)
    if (last !== undefined) {
      const at = last.index + last[0].length
      next =
        next.slice(0, at) + imports.map((edit) => `${edit.line}${eol}`).join('') + next.slice(at)
    }
  }
  const entries = edits.filter(
    (edit) =>
      edit.kind === 'registry' &&
      !next.split('\n').some((raw) => (raw.endsWith('\r') ? raw.slice(0, -1) : raw) === edit.line),
  )
  if (entries.length > 0) {
    const table = /^export const registry = \{(\r?\n)/mu.exec(next)
    if (table !== null) {
      const at = table.index + table[0].length
      next =
        next.slice(0, at) + entries.map((edit) => `${edit.line}${eol}`).join('') + next.slice(at)
    }
  }
  return next
}

/** One line of the app that is its own, not the framework's registration. */
export interface ChangedLine {
  /** 1-based. */
  readonly line: number
  readonly text: string
}

/** One line of the app that is its own, not the framework's registration. */
export interface ChangedLine {
  /** 1-based. */
  readonly line: number
  readonly text: string
}

/**
 * The app's lines that the expected file does not have, in order: the owner's real changes. A line-level longest common subsequence, cut to
 * `limit` lines, so a change reads as the lines it is, not as a whole file.
 */
export function ownerChangeLines(actual: string, expected: string, limit = 5): ChangedLine[] {
  const lineOf = (raw: string | undefined): string =>
    raw === undefined ? '' : raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const left = actual.split('\n')
  const right = expected.split('\n')
  // One table of the longest common subsequence lengths, then the walk reports the app's lines it cannot match.
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  )
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        lineOf(left[i]) === lineOf(right[j])
          ? (lengths[i + 1]![j + 1] ?? 0) + 1
          : Math.max(lengths[i + 1]![j] ?? 0, lengths[i]![j + 1] ?? 0)
    }
  }
  const changed: ChangedLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && changed.length < limit) {
    if (j < right.length && lineOf(left[i]) === lineOf(right[j])) {
      i += 1
      j += 1
      continue
    }
    if (j < right.length && (lengths[i + 1]![j] ?? 0) < (lengths[i]![j + 1] ?? 0)) {
      // The expected file has a line here the app does not: a template line, not the owner's.
      j += 1
      continue
    }
    changed.push({ line: i + 1, text: lineOf(left[i]) })
    i += 1
  }
  return changed
}
