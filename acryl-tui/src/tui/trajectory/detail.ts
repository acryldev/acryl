/**
 * Per-tab text builders for the `/trajectory` detail pane. Pure functions
 * over a `TrajectoryRecord`, kept separate from rendering so the content
 * logic is unit-testable without Ink.
 * @module @tomowang/dsh-tui/tui/trajectory/detail
 */

import type { RenderOptions } from '../../render.js'
import { renderMarkdown } from '../../markdown.js'
import { theme, fg } from '../theme.js'
import type { TrajectoryDetailTab, TrajectoryRecord } from './types.js'

const violet = fg(theme.reasoning)

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

function summaryText(record: TrajectoryRecord): string {
  const lines = [
    `kind      ${record.kind}`,
    `turn/step ${record.turn}/${record.step}`,
    `started   ${formatTime(record.startedAt)}`,
  ]
  if (record.completedAt !== undefined) {
    lines.push(`duration  ${record.completedAt - record.startedAt}ms`)
  }
  if (record.isError) lines.push('status    error')
  return lines.join('\n')
}

function timingText(record: TrajectoryRecord): string {
  if (record.completedAt === undefined) {
    return `started ${formatTime(record.startedAt)}\n(no completion recorded)`
  }
  return [
    `started   ${formatTime(record.startedAt)}`,
    `completed ${formatTime(record.completedAt)}`,
    `duration  ${record.completedAt - record.startedAt}ms`,
  ].join('\n')
}

/** Rendered Preview tab: reasoning (if any) ahead of the visible text, mirroring the transcript's own reasoning-then-answer framing (`formatStreamingText` in `render.ts`). */
function previewText(record: TrajectoryRecord): string {
  const parts: string[] = []
  if (record.reasoning !== undefined) parts.push(violet('✦ thinking'), violet(record.reasoning))
  if (record.payload !== undefined) parts.push(renderMarkdown(record.payload))
  return parts.length === 0 ? '(no content)' : parts.join('\n\n')
}

/** Raw tab: same content as `previewText`, unrendered — the markdown/plain source as the log carries it. */
function rawText(record: TrajectoryRecord): string {
  const parts: string[] = []
  if (record.reasoning !== undefined) parts.push(`[thinking]\n${record.reasoning}`)
  if (record.payload !== undefined) parts.push(record.payload)
  return parts.length === 0 ? '(no content)' : parts.join('\n\n')
}

/** Source tab: the raw `user/message` event's `source` descriptor, pretty-printed. */
function sourceText(record: TrajectoryRecord): string {
  if (record.source === undefined) return '(no source)'
  try {
    return JSON.stringify(record.source, null, 2)
  } catch {
    return '(unserializable source)'
  }
}

/** Schema tab: the tool's own declared `{name, description, parameters}` (`ToolSchema`, via `getTool`) — the live registry's schema, not a per-request snapshot, so it can drift from what an older call actually saw if the tool changed mid-session. */
function schemaText(record: TrajectoryRecord, getTool: RenderOptions['getTool']): string {
  const tool = record.toolName === undefined ? undefined : getTool?.(record.toolName)
  if (tool === undefined) return 'Schema unavailable'
  return JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }, null, 2)
}

/** Render the content of one detail-pane tab for the selected record. */
export function buildDetail(record: TrajectoryRecord, tab: TrajectoryDetailTab, getTool: RenderOptions['getTool']): string {
  switch (tab) {
    case 'summary':
      return summaryText(record)
    case 'payload':
      return record.payload ?? '(no payload)'
    case 'result':
      return record.result ?? '—'
    case 'timing':
      return timingText(record)
    case 'preview':
      return previewText(record)
    case 'raw':
      return rawText(record)
    case 'source':
      return sourceText(record)
    case 'schema':
      return schemaText(record, getTool)
  }
}
