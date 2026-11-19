import { describe, expect, it } from 'vitest'
import { ceilingsFor, estimateTokens, measurePromptBudget, overBudget, splitSections } from '../src/prompt-budget.ts'
import type { CapturedSystemPrompt } from '../src/system-prompt-capture.ts'

const captured = (system: string, tools: Array<[string, object]>): CapturedSystemPrompt => ({
  system,
  model: 'p/m',
  tools: tools.map(([name, definition]) => ({ name, description: '', definition: { name, ...definition } })),
})

describe('splitSections', () => {
  it('names the identity paragraph and each tagged section, with exact sizes', () => {
    const system = 'You are X.\n\n<persona>\nBe kind.\n</persona>\n\n<cwd>\nHere.\n</cwd>'
    const sections = splitSections(system)
    expect(sections.map(s => s.name)).toEqual(['identity', 'persona', 'cwd'])
    expect(sections[0]?.chars).toBe('You are X.'.length)
    expect(sections[1]?.chars).toBe('<persona>\nBe kind.\n</persona>'.length)
  })
  it('has no sections for an empty prompt', () => {
    expect(splitSections('')).toEqual([])
  })
})

describe('the budget guard', () => {
  const base = captured('You are X.\n\n<a>\n12345\n</a>\n\n<cwd>\n/some/path/on/this/machine\n</cwd>', [['t1', { d: 'x'.repeat(50) }], ['t2', { d: 'y'.repeat(10) }]])
  const budget = measurePromptBudget(base)

  it('sorts tools largest first and totals them', () => {
    expect(budget.tools.map(t => t.name)).toEqual(['t1', 't2'])
    expect(budget.toolsChars).toBe(budget.tools.reduce((sum, t) => sum + t.chars, 0))
  })

  it('records a ceiling rounded up to 100 and passes at it', () => {
    const ceilings = ceilingsFor(budget)
    expect(ceilings.systemChars % 100).toBe(0)
    expect(ceilings.toolsChars % 100).toBe(0)
    expect(overBudget(budget, ceilings)).toEqual([])
  })

  it('fails, naming what grew, when the prompt or the tools pass their ceiling', () => {
    const ceilings = ceilingsFor(budget)
    const grownSystem = measurePromptBudget(captured(`${base.system}\n\n<extra>\n${'z'.repeat(200)}\n</extra>`, [['t1', { d: 'x'.repeat(50) }], ['t2', { d: 'y'.repeat(10) }]]))
    expect(overBudget(grownSystem, ceilings)).toEqual([expect.stringContaining('system prompt')])
    const grownTools = measurePromptBudget(captured(base.system, [['t1', { d: 'x'.repeat(500) }], ['t2', { d: 'y'.repeat(10) }]]))
    expect(overBudget(grownTools, ceilings)).toEqual([expect.stringContaining('tool definitions')])
  })

  it('does not count sections that name this machine, so the ceiling is the same on every checkout', () => {
    const elsewhere = measurePromptBudget(captured(base.system.replace('/some/path/on/this/machine', '/a/much/longer/path/on/another/machine/entirely'), [['t1', { d: 'x'.repeat(50) }], ['t2', { d: 'y'.repeat(10) }]]))
    expect(ceilingsFor(elsewhere)).toEqual(ceilingsFor(budget))
  })
})

describe('estimateTokens', () => {
  it('uses the documented ratio', () => {
    expect(estimateTokens(3400)).toBe(1000)
  })
})
