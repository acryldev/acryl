import { describe, expect, it } from 'vitest'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
import type { ContextBreakdownProjection, ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import {
  billedInputTokens,
  buildContextLine,
  buildStatsLine,
  cacheHitPercent,
  contextBreakdownRows,
  contextOccupancy,
  formatDuration,
  formatTokens,
  formatTokensPerSecond,
} from '../../src/tui/statsFormat.js'

describe('formatTokens', () => {
  it('renders raw integers under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('uses a K suffix with one decimal under 100K-scaled', () => {
    expect(formatTokens(1000)).toBe('1K')
    expect(formatTokens(12345)).toBe('12.3K')
  })

  it('rounds to a whole number at or above 100K-scaled', () => {
    expect(formatTokens(123456)).toBe('123K')
    expect(formatTokens(999999)).toBe('1000K')
  })

  it('uses an M suffix past a million', () => {
    expect(formatTokens(1000000)).toBe('1M')
    expect(formatTokens(2500000)).toBe('2.5M')
  })
})

describe('formatDuration', () => {
  it('renders sub-minute durations with one decimal of seconds', () => {
    expect(formatDuration(4520)).toBe('4.5s')
  })

  it('lands in the minutes branch at the 60s boundary', () => {
    expect(formatDuration(60000)).toBe('1m0s')
  })

  it('renders minutes and seconds above a minute', () => {
    expect(formatDuration(162000)).toBe('2m42s')
  })
})

describe('formatTokensPerSecond', () => {
  it('clamps negative input to 0', () => {
    expect(formatTokensPerSecond(-5)).toBe('0')
  })

  it('renders one decimal under 10', () => {
    expect(formatTokensPerSecond(4.26)).toBe('4.3')
  })

  it('rounds to a whole number at or above 10', () => {
    expect(formatTokensPerSecond(131.4)).toBe('131')
  })
})

function usage(partial: Partial<TokenUsageProjection>): TokenUsageProjection {
  return {
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    ...partial,
  } as TokenUsageProjection
}

describe('billedInputTokens', () => {
  it('sums the three input-token buckets', () => {
    expect(billedInputTokens(usage({ uncachedInputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3 }))).toBe(6)
  })
})

describe('cacheHitPercent', () => {
  it('is null when no input was billed', () => {
    expect(cacheHitPercent(usage({}))).toBeNull()
  })

  it('is the rounded cache-read share of billed input', () => {
    expect(cacheHitPercent(usage({ uncachedInputTokens: 20, cacheReadTokens: 80 }))).toBe(80)
  })
})

function stats(partial: Partial<SessionStatsProjection>): SessionStatsProjection {
  return {
    turns: 0,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0,
    ...partial,
  } as SessionStatsProjection
}

describe('buildStatsLine', () => {
  it('renders nothing when both sides are undefined', () => {
    expect(buildStatsLine(undefined, undefined)).toBe('')
  })

  it('drops the whole stats group when steps is 0', () => {
    expect(buildStatsLine(stats({ steps: 0, turns: 1 }), undefined)).toBe('')
  })

  it('shows only turns/steps when every sub-figure is zero', () => {
    expect(buildStatsLine(stats({ turns: 1, steps: 2 }), undefined)).toBe('1 turns · 2 steps')
  })

  it('joins llm and tool durations', () => {
    const line = buildStatsLine(stats({ turns: 1, steps: 1, llmMs: 4300, toolMs: 1200 }), undefined)
    expect(line).toContain('LLM 4.3s')
    expect(line).toContain('Tool call 1.2s')
    expect(line).toContain('LLM 4.3s · Tool call 1.2s')
  })

  it('drops the usage group when nothing was billed or produced', () => {
    expect(buildStatsLine(undefined, usage({}))).toBe('')
  })

  it('omits Cache hit but keeps token counts when nothing was billed as input', () => {
    const line = buildStatsLine(undefined, usage({ outputTokens: 412 }))
    expect(line).not.toContain('Cache hit')
    expect(line).toContain('Input 0 tok · Output 412 tok')
  })

  it('joins multiple groups with a pipe', () => {
    const line = buildStatsLine(
      stats({ turns: 1, steps: 1, llmMs: 4300 }),
      usage({ uncachedInputTokens: 2000, cacheReadTokens: 8000, outputTokens: 412 }),
    )
    expect(line).toContain('1 turns · 1 steps')
    expect(line).toContain('LLM 4.3s')
    expect(line).toContain('Cache hit 80%')
    expect(line).toContain('Input 10K tok · Output 412 tok')
    expect(line.split('| ').length).toBeGreaterThan(1)
  })
})

function pressure(partial: Partial<ContextPressureProjection>): ContextPressureProjection {
  return { ...partial }
}

function breakdown(partial: Partial<ContextBreakdownProjection>): ContextBreakdownProjection {
  return { systemTokens: 0, toolsTokens: 0, messageTokens: 0, ...partial }
}

describe('contextOccupancy', () => {
  it('is null without a usage sample', () => {
    expect(contextOccupancy(undefined)).toBeNull()
    expect(contextOccupancy(pressure({ contextWindow: 1_000_000 }))).toBeNull()
  })

  it('is null without a known context window', () => {
    expect(contextOccupancy(pressure({ pressureTokens: 500 }))).toBeNull()
  })

  it('prefers projectedTokens over pressureTokens', () => {
    const occupancy = contextOccupancy(pressure({ pressureTokens: 100, projectedTokens: 8100, contextWindow: 1_000_000 }))
    expect(occupancy).toEqual({ percent: 1, usedTokens: 8100, contextWindow: 1_000_000 })
  })

  it('falls back to pressureTokens without a projected sample', () => {
    const occupancy = contextOccupancy(pressure({ pressureTokens: 500_000, contextWindow: 1_000_000 }))
    expect(occupancy).toEqual({ percent: 50, usedTokens: 500_000, contextWindow: 1_000_000 })
  })

  it('clamps at 100 percent', () => {
    const occupancy = contextOccupancy(pressure({ projectedTokens: 2_000_000, contextWindow: 1_000_000 }))
    expect(occupancy?.percent).toBe(100)
  })
})

describe('buildContextLine', () => {
  it('renders nothing without a usage sample', () => {
    expect(buildContextLine(undefined)).toBe('')
  })

  it('renders percent and compact used/window tokens', () => {
    const line = buildContextLine(pressure({ projectedTokens: 8100, contextWindow: 1_000_000 }))
    expect(line).toBe('Context 1% · ~8.1K / 1M tok')
  })
})

describe('contextBreakdownRows', () => {
  it('is empty without occupancy', () => {
    expect(contextBreakdownRows(null, breakdown({ systemTokens: 1 }))).toEqual([])
  })

  it('is empty without a breakdown', () => {
    expect(contextBreakdownRows(contextOccupancy(pressure({ pressureTokens: 100, contextWindow: 1000 })), undefined)).toEqual([])
  })

  it('is empty when the breakdown total is 0', () => {
    const occupancy = contextOccupancy(pressure({ pressureTokens: 100, contextWindow: 1000 }))
    expect(contextBreakdownRows(occupancy, breakdown({}))).toEqual([])
  })

  it('scales segment widths to occupancy.percent, not the breakdown sum', () => {
    const occupancy = contextOccupancy(pressure({ pressureTokens: 100, contextWindow: 1000 })) // 10%
    const rows = contextBreakdownRows(occupancy, breakdown({ systemTokens: 100, toolsTokens: 660, messageTokens: 60 }))
    expect(rows.map(r => r.label)).toEqual(['System prompt', 'Tools', 'Messages'])
    expect(rows.map(r => r.tokens)).toEqual([100, 660, 60])
    const totalWidth = rows.reduce((sum, r) => sum + r.width, 0)
    expect(totalWidth).toBeCloseTo(occupancy!.percent, 5)
  })
})
