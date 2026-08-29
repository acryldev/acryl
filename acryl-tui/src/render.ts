/**
 * Terminal projection of durable session events. The TUI renders only from the
 * append-only session log, so a resumed session replays through the exact same
 * code path as live events.
 * @module @tomowang/dsh-tui/render
 */

import { diffLines } from 'diff'
// Type-only so the compaction SessionEvent augmentations (compaction/summary,
// compaction/end) that renderEvents switches on merge into dsh-session's
// SessionEvent union. Mirrors the upstream bundle's own import.
import type {} from '@deepseek-ai/dsh-compaction'
import type { CallId, ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FileDiff, ToolCallView, ToolDefinition, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import { renderMarkdown } from './markdown.js'
import { theme, fg } from './tui/theme.js'

/** Rendering context: replay walks history already in the log. */
export interface RenderOptions {
  /** True while replaying persisted events on startup. */
  replay: boolean
  /** Look up a tool's declared presentation by name; absent outside the live TUI (e.g. tests). */
  getTool?: (name: string) => ToolDefinition | undefined
  /** Look up a `tool/call`'s name/arguments by `callId`, for a later `tool/result` to present with. */
  getToolCall?: (callId: CallId) => { name: string; arguments: string } | undefined
}

const dim = fg(theme.muted)
const cyan = fg(theme.secondary)
const red = fg(theme.error)
const green = fg(theme.success)
const yellow = fg(theme.warning)
const violet = fg(theme.reasoning)

/** Line cap for a settled shell-escape (`!`) run's body in the permanent transcript; `<Static>` prints can't be redrawn, so a long run is summarized there — tool calls/results don't use this cap, since the transcript only ever shows their one-line collapsed summary (see `formatToolCardSummary`), with full detail available via `formatToolCardDetail` in the Tool Cards overlay. */
const MAX_CARD_LINES = 20
/** `diff` package's `maxEditLength`: bounds worst-case diff cost on a huge file, mirroring the removed first-party TUI's default. */
const MAX_DIFF_EDIT_LENGTH = 1000

/** Clamp one-line summaries so tool arguments cannot flood the transcript. */
export function truncate(text: string, max: number): string {
  const oneLine = text.replaceAll('\n', ' ')
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`
}

/** Join the text blocks of a message content array. */
export function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Join the reasoning/thinking blocks of a message content array, distinct from its visible `textOf`. */
export function reasoningOf(content: readonly ContentBlock[]): string {
  return content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
}

/** Preview length for a settled step's reasoning summary line — long enough to be useful, short enough that a long thinking block never floods the transcript; the full text is always in `/trajectory`. */
const REASONING_SUMMARY_LENGTH = 80

/** Format one settled message's reasoning/thinking content as a single collapsed line — the label plus a short preview — never the full body, which stays available via `/trajectory`. */
function formatReasoningSummary(text: string): string {
  return violet(`✦ think · ${truncate(text, REASONING_SUMMARY_LENGTH)}`)
}

/**
 * Format one settled step's text (and, ahead of it, a one-line reasoning
 * summary when the step had any), for the permanent transcript.
 */
export function formatSettledMessage(text: string, reasoningText: string): string | undefined {
  const parts: string[] = []
  if (reasoningText !== '') parts.push(formatReasoningSummary(reasoningText))
  if (text !== '') parts.push(renderMarkdown(text))
  return parts.length === 0 ? undefined : `\n${parts.join('\n')}\n`
}

/**
 * Format the in-progress step's live region: while reasoning has started but
 * no visible text has arrived yet, an animated `spinnerChar thinking` line
 * stands in for the raw, fast-scrolling reasoning body (its settled one-line
 * `✦ think · …` summary appears in the transcript once the step lands —
 * see `formatSettledMessage`); once text starts streaming, that text is
 * shown directly.
 */
export function formatStreamingText(text: string, reasoningText = '', spinnerChar = '✦'): string | undefined {
  if (text === '' && reasoningText === '') return undefined
  if (text === '') return `\n${violet(`${spinnerChar} thinking`)}\n`
  return `\n${renderMarkdown(text)}\n`
}

/** One local shell-escape run's header + output lines, shared by the settled and in-flight renderers below. `exitCode` is `null` while still running. */
function formatShellLines(command: string, output: string, exitCode: number | null): string[] {
  const lines = [`${yellow('!')} ${command}`]
  if (output !== '') lines.push(...splitLines(output).map(dim))
  if (exitCode !== null) lines.push(exitCode === 0 ? dim(`[exit ${exitCode}]`) : red(`[exit ${exitCode}]`))
  return lines
}

/** Format one settled local shell-escape run (`!` prompt-mode) for the permanent transcript, mirroring a `terminal` tool card. */
export function formatShellRun(command: string, output: string, exitCode: number | null): string {
  const lines = capLines(formatShellLines(command, output, exitCode), MAX_CARD_LINES)
  return `\n${lines.join('\n')}\n`
}

/** Format the in-progress shell-escape run's accumulated output for the live region, mirroring `formatStreamingText`'s settle-without-jump framing. */
export function formatShellRunLive(command: string, output: string): string {
  const lines = capLines(formatShellLines(command, output, null), MAX_CARD_LINES)
  return `\n${lines.join('\n')}\n`
}

/** Parse a tool call's JSON-encoded arguments; malformed JSON can't be handed to a presenter. */
function parseJson(text: string): { valid: true; value: unknown } | { valid: false } {
  try {
    return { valid: true, value: JSON.parse(text) as unknown }
  } catch {
    return { valid: false }
  }
}

/** Render a value for display: a string as-is, anything else as pretty JSON. */
function pretty(value: unknown): string {
  if (typeof value === 'string') return value
  const serialized = JSON.stringify(value, null, 2) as string | undefined
  return serialized ?? String(value)
}

/** A string's content lines: empty text is zero lines, a trailing newline terminates the last line. */
function splitLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/** Cap a card body to `max` lines, appending a dim summary of what was omitted. */
function capLines(lines: readonly string[], max: number): string[] {
  if (lines.length <= max) return [...lines]
  const omitted = lines.length - max
  return [...lines.slice(0, max), dim(`… +${omitted} line${omitted === 1 ? '' : 's'} omitted`)]
}

/**
 * One file's change as +/- diff lines under a dim path header. A `null` prior
 * text (new file, or a call-time overwrite with no before-image) renders the
 * whole new text as additions; a comparison beyond `MAX_DIFF_EDIT_LENGTH` falls
 * back to whole-side add/remove so a huge file can't stall formatting.
 */
function renderFileDiff(diff: FileDiff): string[] {
  const lines = [dim(diff.path)]
  if (diff.oldText === null) {
    for (const line of splitLines(diff.newText)) lines.push(green(`+ ${line}`))
    return lines
  }
  const changes = diffLines(diff.oldText, diff.newText, { maxEditLength: MAX_DIFF_EDIT_LENGTH })
  if (changes === undefined) {
    lines.push(dim(`[diff omitted: over ${MAX_DIFF_EDIT_LENGTH} changed lines]`))
    for (const line of splitLines(diff.oldText)) lines.push(red(`- ${line}`))
    for (const line of splitLines(diff.newText)) lines.push(green(`+ ${line}`))
    return lines
  }
  for (const change of changes) {
    const prefix = change.added ? '+' : change.removed ? '-' : ' '
    const color = change.added ? green : change.removed ? red : dim
    for (const line of splitLines(change.value)) lines.push(color(`${prefix} ${line}`))
  }
  return lines
}

/** One or more `FileDiff`s, blank-line separated when there's more than one. */
function renderFileDiffs(diffs: readonly FileDiff[]): string[] {
  return diffs.flatMap((fileDiff, index) => (index > 0 ? [''] : []).concat(renderFileDiff(fileDiff)))
}

/** Today's flat one-line fallback for a pending call, unchanged: no tool, no presenter, bad JSON, or a throwing/`undefined` presenter. */
function fallbackCallLine(name: string, rawArgs: string): string {
  return `${cyan('⚙')} ${name} ${dim(truncate(rawArgs, 100))}`
}

/** Resolve a `tool/call`'s presented view, or `undefined` for any condition that keeps the flat fallback. */
function presentCallSafely(name: string, rawArgs: string, getTool: RenderOptions['getTool']): ToolCallView | undefined {
  const tool = getTool?.(name)
  if (tool?.presentCall === undefined) return undefined
  const parsed = parseJson(rawArgs)
  if (!parsed.valid) return undefined
  try {
    return tool.presentCall(parsed.value)
  } catch {
    return undefined
  }
}

/** A presented pending call's lines: a cyan header (the presenter's title) plus card-specific body. */
function formatCallLines(view: ToolCallView): string[] {
  const header = `${cyan('⚙')} ${view.title}`
  if (view.card === 'terminal') {
    const lines: string[] = []
    if (view.description !== undefined && view.description !== '') lines.push(dim(view.description))
    lines.push(header)
    if (view.cwd !== undefined) lines.push(dim(view.cwd))
    return lines
  }
  if (view.card === 'diff') {
    return [header, ...renderFileDiffs(view.diffs)]
  }
  const rawInput = view.rawInput === undefined ? [] : splitLines(pretty(view.rawInput)).map(dim)
  return [header, ...rawInput]
}

/**
 * A presented call's one-line identity. A `TerminalCallView`'s `title` is
 * deliberately just the bare command with no verb (unlike a `generic`/`diff`
 * title, which a presenter writes to already read as one, e.g. "Read foo.ts")
 * — so on its own it reads as arbitrary text with no hint it was a shell
 * call. Label it with the tool's own name so the one-line summary still
 * names both what ran and how — the command itself is the detail a reader
 * wants here; its optional `description` stays a detail-view-only addition
 * (`formatCallLines` already shows it above the command there).
 */
function callSummaryTitle(name: string, view: ToolCallView): string {
  if (view.card !== 'terminal') return view.title
  const label = name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1)
  return `${label}: ${view.title}`
}

/** A pending call's one-line title, presenting through the tool's `presentCall` when available — shared by the live region's spinner row. */
function pendingCallTitle(name: string, rawArgs: string, getTool: RenderOptions['getTool']): string {
  const view = presentCallSafely(name, rawArgs, getTool)
  return view === undefined ? `${name} ${truncate(rawArgs, 100)}` : callSummaryTitle(name, view)
}

/**
 * Format every tool call that's been sent but has no `tool/result` yet, for
 * the live region: one line per call, the shared spinner frame standing in
 * for the settled ✓/✖ icon it'll collapse to once its result lands and it
 * becomes a single transcript line (see `formatToolCardSummary`).
 */
export function formatPendingToolCalls(
  calls: readonly { name: string; arguments: string }[],
  spinnerChar: string,
  getTool: RenderOptions['getTool'],
): string {
  if (calls.length === 0) return ''
  const lines = calls.map(call => `${cyan(spinnerChar)} ${pendingCallTitle(call.name, call.arguments, getTool)}`)
  return `\n${lines.join('\n')}\n`
}

/** Resolve a `tool/result`'s presented view, or `undefined` for any condition that keeps the flat fallback. */
function presentResultSafely(
  callId: CallId,
  result: ToolResult,
  options: RenderOptions,
): { name: string; view: ToolResultView } | undefined {
  const call = options.getToolCall?.(callId)
  if (call === undefined) return undefined
  const tool = options.getTool?.(call.name)
  if (tool?.presentResult === undefined) return undefined
  const parsed = parseJson(call.arguments)
  if (!parsed.valid) return undefined
  try {
    const view = tool.presentResult(parsed.value, result)
    return view === undefined ? undefined : { name: call.name, view }
  } catch {
    return undefined
  }
}

/** A `tool/result`'s paired `tool/call`'s presented one-line identity, when both the call and a presenter for it resolve — the "pending-state title" a result view's own optional `title` defers to when omitted (see `ToolResultView` docs in `@deepseek-ai/dsh-tools`). */
function resolveCallTitle(callId: CallId, options: RenderOptions): string | undefined {
  const call = options.getToolCall?.(callId)
  if (call === undefined) return undefined
  const view = presentCallSafely(call.name, call.arguments, options.getTool)
  return view === undefined ? undefined : callSummaryTitle(call.name, view)
}

/** Resolved inputs for rendering a settled `tool/result` event. */
type ToolResultResolution =
  | { readonly kind: 'error'; readonly line: string }
  | {
      readonly kind: 'ok'
      readonly icon: string
      readonly content: readonly ContentBlock[]
      readonly presented: { name: string; view: ToolResultView } | undefined
      /** The paired call's presented title, a result view defers to when its own `title` is omitted. */
      readonly callTitle: string | undefined
    }

/** Shared by the transcript's compact line and the Tool Cards overlay's summary/detail, so all three read the same icon and presented view instead of re-deriving it. */
function resolveToolResult(event: Extract<SessionEvent, { type: 'tool/result' }>, options: RenderOptions): ToolResultResolution {
  // `error` marks an internal/harness-level failure (distinct from `isError`
  // on the block, which is the ordinary model-facing outcome). An internal
  // failure is the harness's to report, not a tool's to reformat, so it
  // bypasses presentation entirely.
  if (event.data.error !== undefined) {
    return { kind: 'error', line: `${red('✖')} ${event.data.error.code}: ${event.data.error.name}` }
  }
  const [block] = event.data.message.content
  const failed = block.isError === true
  const icon = failed ? red('✖') : cyan('✓')
  const callId = event.data.message.source.callId
  const result: ToolResult = { content: block.content, isError: failed, ...event.data.meta !== undefined ? { meta: event.data.meta } : {} }
  const presented = presentResultSafely(callId, result, options)
  return { kind: 'ok', icon, content: block.content, presented, callTitle: resolveCallTitle(callId, options) }
}

/** A presented completed call's lines: an outcome-colored header plus card-specific body. `callTitle` is the paired call's presented title — a result view's own `title` field defers to it (the "pending-state title") when omitted, so it comes before the flat fallback name. */
function formatResultLines(fallbackName: string, callTitle: string | undefined, icon: string, rawContent: readonly ContentBlock[], view: ToolResultView): string[] {
  const header = `${icon} ${view.title ?? callTitle ?? fallbackName}`
  switch (view.card) {
    case 'generic': {
      const body = splitLines(textOf(view.content ?? rawContent)).map(dim)
      return [header, ...body]
    }
    case 'terminal': {
      const lines = [header]
      if (view.output !== undefined && view.output !== '') lines.push(...splitLines(view.output).map(dim))
      if (view.exitCode !== undefined) lines.push(dim(`[exit ${view.exitCode}]`))
      if (view.signal !== undefined) lines.push(red(`[signal ${view.signal}]`))
      return lines
    }
    case 'diff': {
      return [header, ...renderFileDiffs(view.diffs)]
    }
    case 'search': {
      const lines = [header]
      let shown = 0
      if (view.shape === 'matches') {
        for (const file of view.files) {
          lines.push(dim(file.path))
          for (const match of file.matches) lines.push(dim(`  ${match.lineNumber}: ${match.line}`))
          shown += file.matches.length
        }
      } else {
        for (const path of view.paths) lines.push(dim(path))
        shown = view.paths.length
      }
      if (view.truncated) lines.push(dim(`… showing ${shown} of ${view.total}`))
      return lines
    }
    case 'read': {
      // Falls back to the call's title, then the read path, not the tool
      // name — a read result's salient identity is which file it read, not
      // which tool read it.
      const lines = [`${icon} ${view.title ?? callTitle ?? view.path}`]
      for (const line of view.lines) lines.push(dim(`${line.number}: ${line.text}`))
      if (view.totalLines > 0) {
        const last = view.offset + view.lines.length - 1
        lines.push(dim(`[${view.offset}-${last} of ${view.totalLines}]`))
      }
      return lines
    }
    case 'web': {
      const lines = [header]
      if (view.kind === 'search') {
        for (const source of view.sources) lines.push(dim(`${source.title ?? source.url} — ${source.url}`))
        if (view.answer !== undefined && view.answer !== '') lines.push(...splitLines(view.answer).map(dim))
      } else {
        lines.push(dim(`${view.url} [${view.statusCode}]`))
      }
      if (view.truncated) lines.push(dim('… truncated'))
      return lines
    }
  }
}

/**
 * One `goal/change` mutation's transcript line, mirroring the durable
 * ledger's `operation`. An explicit `switch` with no `default` over the
 * post-`clear` operation union (rather than a sequential `if` chain ending
 * in an implicit "must be block") so a future `dsh-goal` operation the TUI
 * doesn't know about fails to compile here instead of silently rendering
 * the wrong line.
 */
function goalChangeLine(change: SessionEvent<'goal/change'>['data']): string {
  if (change.operation === 'clear') return `${dim('🗑')} goal cleared`
  const goal = change.goal
  switch (change.operation) {
    case 'create': return `${cyan('🎯')} goal set: ${goal.objective}`
    case 'edit': return `${cyan('🎯')} goal updated: ${goal.objective}`
    case 'pause': return `${yellow('⏸')} goal paused: ${goal.objective}`
    case 'resume': return `${green('▶')} goal resumed: ${goal.objective}`
    case 'complete': return `${green('✓')} goal complete: ${goal.objective}`
    case 'block':
      return `${red('⛔')} goal blocked${goal.blockedReason === undefined ? '' : `: ${goal.blockedReason.code}: ${goal.blockedReason.message}`}`
  }
}

/**
 * Format one durable session event as a terminal line, or `undefined` for
 * events this viewer does not present. Unknown event types are silently
 * skipped: the log's vocabulary is merge-extensible and a transcript viewer
 * must tolerate events from plugins it does not know.
 * @param event - the durable session event to project.
 * @param options - replay/live rendering context, plus optional tool-presentation resolvers.
 */
export function formatEvent(event: SessionEvent, options: RenderOptions): string | undefined {
  switch (event.type) {
    case 'user/message': {
      const source = event.data.source
      // Only a direct human prompt gets the full transcript line; synthetic
      // context (`agent.inject()` — subdir AGENTS.md, skill content, cron
      // notices, …) collapses to one label instead of dumping its content.
      if (source.kind === 'user') {
        const text = textOf(event.data.content)
        return text === '' ? undefined : `${dim('you ›')} ${text}`
      }
      if (source.kind === 'plugin') {
        const summary = source.form === 'notice' ? source.summary : undefined
        return `${dim('⊕ context ›')} ${source.plugin}${summary === undefined ? '' : ` · ${summary}`}`
      }
      // An admitted goal continuation round: collapsed to a label like the
      // web portal's context rows, but naming the round so automatic
      // continuation is legible in the transcript. The `<goal_round>` prompt
      // content itself stays folded away.
      if (source.kind === 'goal') {
        return `${dim('⊕ goal ›')} round ${source.round}`
      }
      return `${dim('⊕ context ›')} ${source.kind}`
    }
    case 'assistant/message': {
      const content = event.data.message.content
      return formatSettledMessage(textOf(content), reasoningOf(content))
    }
    case 'tool/call': {
      // Never gets its own transcript line: while pending it shows as a
      // spinner row in the live region (see `formatPendingToolCalls`), and
      // once its `tool/result` lands, that event contributes the one
      // collapsed transcript line for the pair (see below). Full detail for
      // either half is still available via `formatToolCardDetail` in the
      // Tool Cards overlay (Ctrl+O / `/tools`).
      return undefined
    }
    case 'tool/result': {
      // Collapsed to the same one-line summary as the Tool Cards overlay's
      // row — the transcript reads as a log, not a set of inline panels; see
      // `formatToolCardSummary`/`formatToolCardDetail` for the expanded view.
      return formatToolCardSummary(event, options)
    }
    case 'turn/end': {
      const reason = event.data.reason
      if (reason.kind === 'error') {
        return `${red('✖')} ${reason.error.code}: ${reason.error.message}`
      } else if (reason.kind === 'aborted') {
        return `${yellow('⏹')} ${dim('turn canceled')}`
      }
      return undefined
    }
    case 'compaction/summary': {
      return `${cyan('⊙')} compacted ${event.data.shadowedSeqs.length} items (~${event.data.shadowedTokenCount} tokens)`
    }
    case 'compaction/end': {
      return event.data.error === undefined ? undefined : `${red('✖')} compaction: ${event.data.error}`
    }
    case 'goal/change':
      // The durable goal ledger, one line per mutation — the web portal
      // covers this trace with its `/goal` command-input chat node, which the
      // TUI has no equivalent of (the prompt consumes `/goal` without echoing
      // it), so the log-first transcript renders the event itself.
      return goalChangeLine(event.data)
    default:
      // Merge-extensible union: events this viewer does not present fall through.
      return undefined
  }
}

/**
 * A `tool/call`/`tool/result` event's one-line summary — the Tool Cards
 * overlay's collapsed row. Distinct from `formatEvent`'s own card rendering
 * (which can be multi-line even at its most compact), because the overlay
 * needs a genuine single line to toggle open from.
 */
export function formatToolCardSummary(event: SessionEvent, options: RenderOptions): string {
  if (event.type === 'tool/call') {
    const view = presentCallSafely(event.data.name, event.data.arguments, options.getTool)
    return view === undefined ? fallbackCallLine(event.data.name, event.data.arguments) : `${cyan('⚙')} ${callSummaryTitle(event.data.name, view)}`
  }
  if (event.type === 'tool/result') {
    const resolved = resolveToolResult(event, options)
    if (resolved.kind === 'error') return resolved.line
    const { icon, content, presented, callTitle } = resolved
    if (presented === undefined) {
      const text = truncate(textOf(content), 100)
      return text === '' ? icon : `${icon} ${dim(text)}`
    }
    return `${icon} ${presented.view.title ?? callTitle ?? presented.name}`
  }
  return ''
}

/**
 * Full, uncapped presentation lines for a `tool/call`/`tool/result` event.
 * Unlike `formatEvent`, this never truncates or omits — the Tool Cards
 * overlay scrolls its own window over the result instead of relying on a
 * fixed line cap, so it needs the complete card body to scroll through.
 */
export function formatToolCardDetail(event: SessionEvent, options: RenderOptions): string[] {
  if (event.type === 'tool/call') {
    const view = presentCallSafely(event.data.name, event.data.arguments, options.getTool)
    return view === undefined ? [fallbackCallLine(event.data.name, event.data.arguments)] : formatCallLines(view)
  }
  if (event.type === 'tool/result') {
    const resolved = resolveToolResult(event, options)
    if (resolved.kind === 'error') return [resolved.line]
    const { icon, content, presented, callTitle } = resolved
    if (presented === undefined) {
      const text = textOf(content)
      return text === '' ? [icon] : [icon, ...splitLines(text)]
    }
    return formatResultLines(presented.name, callTitle, icon, content, presented.view)
  }
  return []
}
