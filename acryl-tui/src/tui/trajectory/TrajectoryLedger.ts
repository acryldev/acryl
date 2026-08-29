/**
 * Pure line-builder for the `/trajectory` ledger's rows: turn/step boundary
 * markers, one line per record (colored kind tag + icon + label), and
 * collapsed-turn summaries. `TrajectoryOverlay` owns scroll-window slicing;
 * this only formats whatever slice it's given.
 * @module @tomowang/dsh-tui/tui/trajectory/TrajectoryLedger
 */

import type { TrajectoryRecord, TrajectoryRow } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)

function recordGlyph(record: TrajectoryRecord): string {
  if (record.kind === 'tool') return record.isError ? '✖' : '⚙'
  if (record.kind === 'header') return '⊕'
  return ' '
}

/** Kind tags, matching the web ledger's USER/CONTEXT/ASSISTANT/TOOL wording exactly (`header` has no web counterpart). */
const KIND_TAG: Record<TrajectoryRecord['kind'], string> = {
  user: 'USER',
  context: 'CONTEXT',
  assistant: 'ASSISTANT',
  tool: 'TOOL',
  header: 'HEADER',
}

const KIND_TAG_WIDTH = Math.max(...Object.values(KIND_TAG).map(tag => tag.length))

/** Mirrors the web ledger's per-row kind tag coloring (assistant violet, tool amber, user brand blue, context mint, header neutral). */
function kindColor(kind: TrajectoryRecord['kind']): string {
  switch (kind) {
    case 'user': return theme.primary
    case 'context': return theme.success
    case 'assistant': return theme.reasoning
    case 'tool': return theme.warning
    case 'header': return theme.muted
  }
}

function recordLine(record: TrajectoryRecord, selected: boolean): string {
  const tag = bold(fg(kindColor(record.kind))(KIND_TAG[record.kind].padEnd(KIND_TAG_WIDTH)))
  const body = `${selected ? '› ' : '  '}${tag} ${recordGlyph(record)} ${record.label}`
  const withColor = record.isError ? errorColor(body) : record.kind === 'header' ? muted(body) : body
  return selected ? invert(withColor) : withColor
}

export function buildLedgerLines(rows: readonly TrajectoryRow[], selectedId: string | undefined): string[] {
  return rows.map((row) => {
    switch (row.kind) {
      case 'turn':
        return bold(secondary(`── Turn ${row.turn} ──${row.aborted === undefined ? '' : ` ⚠ ${row.aborted}`}`))
      case 'step':
        return muted(`  Step ${row.step}`)
      case 'collapsed':
        return muted(`  … ${row.count} record${row.count === 1 ? '' : 's'} collapsed`)
      case 'record':
        return recordLine(row.record, row.record.id === selectedId)
    }
  })
}
