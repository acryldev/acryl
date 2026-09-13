/**
 * Wires this app's own slash-command (`commands.ts`) and `@`-file-mention
 * (`fileMention.ts`) query logic into pi-tui's `AutocompleteProvider` seam
 * for `CustomEditor` — kept as dsh-tui's own `git ls-files`-backed file index
 * rather than pi-tui's built-in `fd`-shelling completion, to preserve
 * existing behavior without a new external binary dependency.
 * @module @tomowang/dsh-tui/tui/promptAutocomplete
 */

import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from '@earendil-works/pi-tui'
import { commandQuery, matchSlashCommands } from './commands.js'
import { mentionQuery, matchFileCandidates } from './fileMention.js'

function offsetToLineCol(lines: readonly string[], offset: number): { line: number; col: number } {
  let remaining = offset
  for (let line = 0; line < lines.length; line++) {
    const len = lines[line].length
    if (remaining <= len) return { line, col: remaining }
    remaining -= len + 1
  }
  const lastLine = Math.max(0, lines.length - 1)
  return { line: lastLine, col: lines[lastLine]?.length ?? 0 }
}

function lineColToOffset(lines: readonly string[], line: number, col: number): number {
  let offset = 0
  for (let i = 0; i < line; i++) offset += lines[i].length + 1
  return offset + col
}

function splitWithCursor(text: string, offset: number): { lines: string[]; cursorLine: number; cursorCol: number } {
  const lines = text.split('\n')
  const { line, col } = offsetToLineCol(lines, offset)
  return { lines, cursorLine: line, cursorCol: col }
}

/** Fetch (loading it on first use) the repo-relative file list backing `@`-mention. */
export type GetFileCandidates = () => Promise<readonly string[]>

export class PromptAutocompleteProvider implements AutocompleteProvider {
  readonly triggerCharacters = ['/', '@']

  constructor(private readonly getFileCandidates: GetFileCandidates) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    { signal }: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const value = lines.join('\n')
    const offset = lineColToOffset(lines, cursorLine, cursorCol)

    const { isCommandMode, matches } = commandQuery(value)
    if (isCommandMode) {
      if (matches.length === 0) return null
      const items: AutocompleteItem[] = matches.map(c => ({ value: c.command, label: c.command, description: c.description }))
      return { items, prefix: value.trim() }
    }

    const mention = mentionQuery(value, offset)
    if (!mention.isMentionMode) return null
    const candidates = await this.getFileCandidates()
    if (signal.aborted) return null
    const paths = matchFileCandidates(candidates, mention.query)
    if (paths.length === 0) return null
    const items: AutocompleteItem[] = paths.map(path => ({ value: path, label: path }))
    return { items, prefix: mention.query }
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    _prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const value = lines.join('\n')
    const offset = lineColToOffset(lines, cursorLine, cursorCol)

    const { isCommandMode } = commandQuery(value)
    if (isCommandMode) {
      return splitWithCursor(item.value, item.value.length)
    }

    const mention = mentionQuery(value, offset)
    if (mention.isMentionMode) {
      const start = mention.start + 1
      const end = start + mention.query.length
      const inserted = `${item.value} `
      const newValue = value.slice(0, start) + inserted + value.slice(end)
      return splitWithCursor(newValue, start + inserted.length)
    }

    return { lines, cursorLine, cursorCol }
  }

  shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
    const value = lines.join('\n')
    const offset = lineColToOffset(lines, cursorLine, cursorCol)
    return mentionQuery(value, offset).isMentionMode
  }
}

/** Re-exported for `CustomEditor`, which also needs to check command-mode text on plain Tab (completion without submitting). */
export { matchSlashCommands }
