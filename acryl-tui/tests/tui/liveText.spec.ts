import { describe, expect, it } from 'vitest'
import type { GoalProjection } from '@deepseek-ai/dsh-goal'
import { buildGoalBarText, buildTerminalTitle, buildUpdateHintText } from '../../src/tui/liveText.js'

/** A minimal 'goal' projection fixture; only the fields the strip reads are meaningful. */
function projection(over: Partial<GoalProjection['goal']> = {}): GoalProjection {
  return {
    goal: {
      id: 'goal-1' as GoalProjection['goal']['id'],
      revision: 1,
      objective: 'Ship the redesign',
      phase: 'active',
      maxGoalRounds: 256,
      ...over,
    },
    roundsStarted: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('buildGoalBarText', () => {
  it('renders nothing while loading (projection unit not composed), absent, or cleared', () => {
    expect(buildGoalBarText(undefined)).toBe('')
    expect(buildGoalBarText(null)).toBe('')
  })

  it('renders nothing for a complete goal, mirroring the web GoalBar', () => {
    expect(buildGoalBarText(projection({ phase: 'complete' }))).toBe('')
  })

  it('shows the phase label and truncated objective for an active goal', () => {
    const text = buildGoalBarText(projection())
    expect(text).toContain('active')
    expect(text).toContain('Ship the redesign')
    expect(text).toContain('🎯')
  })

  it('shows the paused phase label', () => {
    expect(buildGoalBarText(projection({ phase: 'paused' }))).toContain('paused')
  })

  it('appends the blocker code and message for a blocked goal', () => {
    const text = buildGoalBarText(projection({
      phase: 'blocked',
      blockedReason: { code: 'round-limit', message: 'Goal reached its configured limit of 256 rounds.' },
    }))
    expect(text).toContain('blocked')
    expect(text).toContain('round-limit')
    expect(text).toContain('Goal reached its configured limit of 256 rounds.')
  })

  it('truncates a long objective to the strip cap', () => {
    const text = buildGoalBarText(projection({ objective: 'x'.repeat(200) }))
    expect(text).toContain('…')
    // '🎯 active · ' prefix + the 80-char truncated objective, plus ANSI codes.
    expect(text.length).toBeLessThan(200)
  })
})

describe('buildTerminalTitle', () => {
  it('falls back to the bare product name while loading or without the session-title service composed', () => {
    expect(buildTerminalTitle(undefined)).toBe('dsh-tui')
    expect(buildTerminalTitle(null)).toBe('dsh-tui')
  })

  it('suffixes the accepted session title with the product name', () => {
    expect(buildTerminalTitle('Read-only agent preset creation')).toBe('Read-only agent preset creation — dsh-tui')
  })
})

describe('buildUpdateHintText', () => {
  it('renders nothing while unchecked or already current', () => {
    expect(buildUpdateHintText('0.6.0', undefined)).toBe('')
  })

  it('shows the current and newer version plus the upgrade command once one is found', () => {
    const text = buildUpdateHintText('0.6.0', '0.7.0')
    expect(text).toContain('0.6.0')
    expect(text).toContain('0.7.0')
    expect(text).toContain('dsh plugin --profile tui add @tomowang/dsh-tui')
  })
})
