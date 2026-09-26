import { describe, expect, it } from 'vitest'
import { WORKSPACE_PTY_COMMAND_IDS } from '../../src/pty/contract.ts'
import { WORKSPACE_AGENT_COMMANDS } from '../../src/client/terminal/agent-commands.ts'
import { HIDDEN_AGENTS_KEY, readHiddenAgents, toggleAgent, visibleAgents, writeHiddenAgents } from '../../src/client/tabs/agent-visibility.ts'
import { MAX_TAB_TITLE, normalizeTabTitle } from '../../src/client/tabs/tab-title.ts'

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

describe('agent visibility', () => {
  const store = (initial?: string) => {
    let value = initial
    return { getItem: () => value ?? null, setItem: (_key: string, next: string) => { value = next } }
  }
  it('lists every agent by default', () => {
    expect(visibleAgents(WORKSPACE_AGENT_COMMANDS, readHiddenAgents(undefined))).toHaveLength(WORKSPACE_PTY_COMMAND_IDS.length - 1)
  })
  it('hides and shows agents and remembers the choice', () => {
    const s = store()
    let hidden = toggleAgent(new Set(), 'aider')
    hidden = toggleAgent(hidden, 'goose')
    writeHiddenAgents(s, hidden)
    const again = readHiddenAgents(s)
    expect(visibleAgents(WORKSPACE_AGENT_COMMANDS, again).map(a => a.id)).not.toContain('aider')
    expect(toggleAgent(again, 'aider').has('aider')).toBe(false)
  })
  it('treats damaged storage as nothing hidden', () => {
    expect(readHiddenAgents(store('{not json')).size).toBe(0)
    expect(readHiddenAgents(store('{"a":1}')).size).toBe(0)
    expect(readHiddenAgents(store('[1,"x"]'))).toEqual(new Set(['x']))
    expect(HIDDEN_AGENTS_KEY).toContain('hidden-agents')
  })
})
