import { describe, expect, it } from 'vitest'
import { HIDDEN_AGENTS_KEY, readHiddenAgents, toggleAgent, writeHiddenAgents } from '../../src/client/tabs/agent-visibility.ts'
import { AGENT_MARKS } from '../../src/client/tabs/agent-marks.tsx'
import { MAX_TAB_TITLE, normalizeTabTitle } from '../../src/client/canvas/tab-title.ts'
import { KNOWN_AGENT_IDS } from '../../src/agents/known-agents.ts'

describe('agent marks', () => {
  it('draws every known agent, not just the letter badge fallback', () => {
    for (const id of KNOWN_AGENT_IDS) {
      expect(AGENT_MARKS[id], `${id} has no drawn mark`).toBeDefined()
    }
    expect(AGENT_MARKS.shell).toBeDefined()
  })
})

describe('normalizeTabTitle', () => {
  it('trims, collapses whitespace and caps the length', () => {
    expect(normalizeTabTitle('  api   server ')).toBe('api server')
    expect(normalizeTabTitle('x'.repeat(100))).toHaveLength(MAX_TAB_TITLE)
  })
  it('returns null for nothing usable so the tab goes back to its own name', () => {
    expect(normalizeTabTitle('')).toBeNull()
    expect(normalizeTabTitle(' \n\t ')).toBeNull()
  })
  it('never cuts a character in half', () => {
    expect(normalizeTabTitle('😀'.repeat(60))).toBe('😀'.repeat(MAX_TAB_TITLE))
  })
})

describe('hidden tab types', () => {
  const store = (initial?: string) => {
    let value = initial
    return { getItem: () => value ?? null, setItem: (_key: string, next: string) => { value = next } }
  }
  it('hides and shows tab types and remembers the choice', () => {
    const s = store()
    let hidden = toggleAgent(new Set(), 'surface:diff')
    hidden = toggleAgent(hidden, 'surface:kanban')
    writeHiddenAgents(s, hidden)
    const again = readHiddenAgents(s)
    expect(again).toEqual(new Set(['surface:diff', 'surface:kanban']))
    expect(toggleAgent(again, 'surface:diff').has('surface:diff')).toBe(false)
  })
  it('treats damaged storage as nothing hidden', () => {
    expect(readHiddenAgents(store('{not json')).size).toBe(0)
    expect(readHiddenAgents(store('{"a":1}')).size).toBe(0)
    expect(readHiddenAgents(store('[1,"x"]'))).toEqual(new Set(['x']))
    expect(HIDDEN_AGENTS_KEY).toContain('hidden-agents')
  })
})
