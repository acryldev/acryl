/**
 * Plain data shapes for the `/trajectory` ledger overlay: a turn/step-grouped
 * projection of the session log, independent of Ink/React so `layout.ts` and
 * `detail.ts` stay unit-testable without rendering.
 * @module @tomowang/dsh-tui/tui/trajectory/types
 */

/**
 * What kind of session record a ledger row represents. `context` mirrors the
 * web ledger's split of `user/message` by `source.kind`: a direct human
 * prompt is `user`, while plugin-injected context (subdir AGENTS.md, skill
 * content, cron notices, …) is `context` — see `userLabel` in `layout.ts`.
 */
export type TrajectoryRecordKind = 'user' | 'context' | 'assistant' | 'tool' | 'header'

/**
 * Which tab of the detail pane is showing for the selected record. Not every
 * tab applies to every record kind — see `detailTabsFor`, which mirrors the
 * web ledger's per-kind split (`detailTabs()` in `TrajectoryTable.tsx`).
 */
export type TrajectoryDetailTab = 'summary' | 'payload' | 'result' | 'schema' | 'timing' | 'preview' | 'raw' | 'source'

/** One selectable ledger entry: a user/assistant message, a tool call+result pair, or a header change. */
export interface TrajectoryRecord {
  /** Stable identity: the tool `callId` for tool records, else `seq` as a string. */
  readonly id: string
  readonly kind: TrajectoryRecordKind
  readonly turn: number
  readonly step: number
  /** The seq of the record's opening event (call/message), used for ordering and selection. */
  readonly seq: number
  readonly startedAt: number
  /** Set once the paired result/message lands; `undefined` for a still-open tool call. */
  readonly completedAt: number | undefined
  /** One-line ledger row text, already truncated/ANSI-decorated like `formatEvent`'s output. */
  readonly label: string
  readonly isError: boolean
  /** Untruncated one-line description for the Summary tab. */
  readonly summary: string
  /** Full input payload (tool arguments, a direct human prompt's text, header JSON), for the Payload tab (tool/header) and the Preview/Raw tabs (user/context/assistant, where it's visible text only — see `reasoning` for an assistant's thinking). */
  readonly payload: string | undefined
  /** Full result content (tool result, error), for the Result tab; `undefined` for non-tool kinds. */
  readonly result: string | undefined
  /** An assistant step's reasoning/thinking text, independent of `payload`'s visible text; `undefined` for non-assistant kinds or a step with none. */
  readonly reasoning: string | undefined
  /** The raw `user/message` event's `source` (`{kind: 'user'}` or a plugin's injected-context descriptor), for the Source tab; `undefined` for non-user/context kinds. */
  readonly source: unknown
  /** Tool name, for the Schema tab's `getTool` lookup; `undefined` for non-tool kinds, or an unmatched result with no known call. */
  readonly toolName: string | undefined
}

/**
 * Which detail tabs apply to a record, mirroring the web ledger's per-kind
 * split: a markdown record (user/context/assistant) gets Summary/Preview/Raw
 * plus Source only when the underlying event actually carried one (user and
 * context always do; assistant never does — see `layout.ts`). Everything
 * else (tool, header) gets Summary plus whichever of Payload/Result the
 * record actually has, and — tool records only — Schema, always followed by
 * Timing.
 */
export function detailTabsFor(record: TrajectoryRecord): readonly TrajectoryDetailTab[] {
  if (record.kind === 'user' || record.kind === 'context' || record.kind === 'assistant') {
    const tabs: TrajectoryDetailTab[] = ['summary', 'preview', 'raw']
    if (record.source !== undefined) tabs.push('source')
    return tabs
  }
  const tabs: TrajectoryDetailTab[] = ['summary']
  if (record.payload !== undefined) tabs.push('payload')
  if (record.result !== undefined) tabs.push('result')
  if (record.kind === 'tool') tabs.push('schema')
  tabs.push('timing')
  return tabs
}

/** One row of the ledger: a boundary marker, a record, or a collapsed-turn summary. */
export type TrajectoryRow =
  | { readonly kind: 'turn'; readonly turn: number; readonly aborted: string | undefined }
  | { readonly kind: 'step'; readonly turn: number; readonly step: number }
  | { readonly kind: 'record'; readonly record: TrajectoryRecord }
  | { readonly kind: 'collapsed'; readonly turn: number; readonly count: number }
