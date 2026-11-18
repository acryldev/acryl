import { describe, expect, it } from 'vitest'
import { countRunning, runningLabel } from '../../src/client/sessions/running-agents.ts'

describe('running agents', () => {
  it('counts every running session', () => {
    expect(countRunning([{ running: true }, { running: false }, { running: true }])).toBe(2)
    expect(countRunning([])).toBe(0)
  })
  it('words the count and hides itself at zero', () => {
    expect(runningLabel(0)).toBeNull()
    expect(runningLabel(1)).toBe('1 agent running')
    expect(runningLabel(2)).toBe('2 agents running')
  })
})
