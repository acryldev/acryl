import { describe, expect, it } from 'vitest'
import { filterPluginRows, fuzzyScore } from '../../src/tui/plugins/PluginsOverlay.js'
import type { PluginRow } from '../../src/tui/plugins/types.js'

function row(id: string, name: string): PluginRow {
  return { id, name, disabled: false, group: false, state: undefined, mutable: true }
}

describe('fuzzyScore', () => {
  it('matches an empty query against anything with score 0', () => {
    expect(fuzzyScore('dsh-editor', '')).toBe(0)
  })

  it('matches a contiguous substring with a tighter score than a spread-out one', () => {
    const tight = fuzzyScore('dsh-editor-cli', 'edit')
    const spread = fuzzyScore('dsh-editor-cli', 'dei')
    expect(tight).toBeDefined()
    expect(spread).toBeDefined()
    expect(tight as number).toBeLessThan(spread as number)
  })

  it('matches a non-contiguous subsequence out of order characters is not allowed', () => {
    expect(fuzzyScore('dsh-editor', 'dse')).toBeDefined()
    expect(fuzzyScore('dsh-editor', 'edsh')).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('DSH-Editor', 'dse')).toBeDefined()
    expect(fuzzyScore('dsh-editor', 'DSE')).toBeDefined()
  })

  it('returns undefined when a query character never appears', () => {
    expect(fuzzyScore('dsh-editor', 'z')).toBeUndefined()
  })

  it('returns undefined when the query is longer than any possible match', () => {
    expect(fuzzyScore('ab', 'abc')).toBeUndefined()
  })
})

describe('filterPluginRows', () => {
  const rows = [
    row('include:dsh-editor', 'acryl-dsh-editor-plugin'),
    row('include:dsh-editor-cli', 'acryl-dsh-editor-plugin-cli'),
    row('include:tool-fs', '@deepseek-ai/dsh-tool-fs'),
    row('include:agent-loop', '@deepseek-ai/dsh-agent-loop'),
  ]

  it('returns every row unchanged, in original order, for an empty query', () => {
    expect(filterPluginRows(rows, '')).toEqual(rows)
  })

  it('drops rows that do not fuzzy-match either id or name', () => {
    const result = filterPluginRows(rows, 'zzz')
    expect(result).toEqual([])
  })

  it('matches against the id', () => {
    const result = filterPluginRows(rows, 'toolfs')
    expect(result.map(r => r.id)).toEqual(['include:tool-fs'])
  })

  it('matches against the name when the id does not match', () => {
    const result = filterPluginRows(rows, 'agentloop')
    expect(result.map(r => r.id)).toEqual(['include:agent-loop'])
  })

  it('ranks a tighter match before a looser one', () => {
    const result = filterPluginRows(rows, 'editor')
    expect(result.map(r => r.id)).toEqual(['include:dsh-editor', 'include:dsh-editor-cli'])
  })
})
