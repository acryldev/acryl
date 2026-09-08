/**
 * Pure formatting for the status bar's stats line: turn/step counts, LLM/tool
 * wall time, first-token latency, decode throughput, cache hit rate, and
 * billed tokens. Mirrors the web portal's `StatsLine` (`ui-conversation`)
 * field-for-field so the two surfaces read the same figures the same way;
 * duplicated rather than imported since dsh-tui carries no web-client
 * dependency.
 * @module @tomowang/dsh-tui/tui/statsFormat
 */

import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
import type { ContextBreakdownProjection, ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'

/**
 * Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits).
 * @param n - token count.
 * @returns display string.
 */
export function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/**
 * Compact duration: 45.2s under a minute, 2m42s from there on.
 * @param ms - duration in milliseconds.
 * @returns display string.
 */
export function formatDuration(ms: number): string {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/**
 * Compact throughput: one decimal under 10 tok/s, whole above.
 * @param tps - tokens per second.
 * @returns display string.
 */
export function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/**
 * Sum the three disjoint prompt-side billing buckets.
 * @param usage - the session's token-usage projection value.
 * @returns billed input tokens.
 */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Cache-hit share of prompt-side input over the whole durable log.
 * @param usage - the session's token-usage projection value.
 * @returns rounded integer percent, or null when no input was billed.
 */
export function cacheHitPercent(usage: TokenUsageProjection): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0 ? null : Math.round(usage.cacheReadTokens / denominator * 100)
}

/**
 * Build the pipe-separated stats line for the status bar, e.g.
 * `1 turns · 1 steps| LLM 4.3s| TTFT avg 1.1s · 131 tok/s| Cache hit 80%| Input 9.1K tok · Output 412 tok`.
 * A group with no data drops out whole; an empty return means nothing to show yet.
 * @param stats - whole-log turn/step counts and wall times, or `undefined` without the projection unit mounted.
 * @param usage - whole-log provider token usage, or `undefined` without the projection unit mounted.
 * @returns the joined line, or `''` when there is nothing to display.
 */
export function buildStatsLine(
  stats: SessionStatsProjection | undefined,
  usage: TokenUsageProjection | undefined,
): string {
  const groups: string[] = []
  if (stats !== undefined && stats.steps > 0) {
    groups.push(`${stats.turns} turns · ${stats.steps} steps`)
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(`LLM ${formatDuration(stats.llmMs)}`)
    if (stats.toolMs > 0) durations.push(`Tool call ${formatDuration(stats.toolMs)}`)
    if (durations.length > 0) groups.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) speeds.push(`TTFT avg ${formatDuration(stats.ttftMs / stats.ttftSteps)}`)
    if (stats.decodeMs > 0) {
      speeds.push(`${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`)
    }
    if (speeds.length > 0) groups.push(speeds.join(' · '))
  }
  if (usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const cacheHit = cacheHitPercent(usage)
    if (cacheHit !== null) groups.push(`Cache hit ${cacheHit}%`)
    groups.push(`Input ${formatTokens(billedInputTokens(usage))} tok · Output ${formatTokens(usage.outputTokens)} tok`)
  }
  return groups.join('| ')
}

/** Approximate context occupancy, mirroring the web portal's `contextOccupancy`. */
export interface ContextOccupancy {
  /** Rounded percent of the context window in use, clamped to 100. */
  readonly percent: number
  /** `projectedTokens` when the provider has reported usage since the last surface change, else the last raw `pressureTokens` sample. */
  readonly usedTokens: number
  /** Newest recorded route capacity. */
  readonly contextWindow: number
}

/**
 * Derive occupancy from the newest pressure sample, or `null` while either
 * side (a usage sample, a known route capacity) hasn't arrived yet.
 * @param pressure - the session's context-pressure projection value.
 * @returns occupancy figures, or `null` when there is nothing to show yet.
 */
export function contextOccupancy(pressure: ContextPressureProjection | undefined): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

/**
 * Build the always-on compact context-usage line, e.g. `Context 1% · ~8.1K / 1M tok`.
 * @param pressure - the session's context-pressure projection value.
 * @returns the display line, or `''` when there is nothing to show yet.
 */
export function buildContextLine(pressure: ContextPressureProjection | undefined): string {
  const occupancy = contextOccupancy(pressure)
  if (occupancy === null) return ''
  return `Context ${occupancy.percent}% · ~${formatTokens(occupancy.usedTokens)} / ${formatTokens(occupancy.contextWindow)} tok`
}

/** One row of the `/context` overlay's System/Tools/Messages breakdown. */
export interface ContextBreakdownRow {
  readonly label: string
  readonly tokens: number
  /** Bar-segment width in percentage points, scaled to `occupancy.percent` rather than the breakdown's own sum. */
  readonly width: number
}

/**
 * Proportional breakdown rows for the `/context` overlay's bar. The three
 * heuristic figures are composition only — they do not sum to
 * `occupancy.usedTokens` — so segment widths are scaled to `occupancy.percent`
 * rather than treated as an independent total; see `ContextBreakdownProjection`'s doc comment.
 * @param occupancy - this session's occupancy figures, or `null` without a usage sample yet.
 * @param breakdown - the session's context-breakdown projection value.
 * @returns the three rows in System/Tools/Messages order, or `[]` when there is nothing to show yet.
 */
export function contextBreakdownRows(
  occupancy: ContextOccupancy | null,
  breakdown: ContextBreakdownProjection | undefined,
): readonly ContextBreakdownRow[] {
  if (occupancy === null || breakdown === undefined) return []
  const total = breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  if (total === 0) return []
  const scale = (tokens: number): number => occupancy.percent * tokens / total
  return [
    { label: 'System prompt', tokens: breakdown.systemTokens, width: scale(breakdown.systemTokens) },
    { label: 'Tools', tokens: breakdown.toolsTokens, width: scale(breakdown.toolsTokens) },
    { label: 'Messages', tokens: breakdown.messageTokens, width: scale(breakdown.messageTokens) },
  ]
}
