import { describe, expect, it, vi } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import { PluginsOverlay, filterPluginRows, fuzzyScore } from '../../src/tui/plugins/PluginsOverlay.js'
import type { TuiActions } from '../../src/tui/actions.js'
import type { PluginRow } from '../../src/tui/plugins/types.js'

function row(id: string, name: string): PluginRow {
  return { id, name, disabled: false, group: false, state: undefined, mutable: true }
}

function stubTui(): TUI {
  return { terminal: { rows: 24, cols: 80 }, requestRender: vi.fn() } as unknown as TUI
}

function stubActions(): TuiActions {
  return { closePlugins: vi.fn(), togglePlugin: vi.fn() } as unknown as TuiActions
}

const ARROW_UP = '\x1b[A'
const ARROW_DOWN = '\x1b[B'

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

describe('PluginsOverlay filtering', () => {
  // Regression: reported directly against a real 91-row profile - after typing
  // a filter query, arrow keys did nothing at all, leaving the selection
  // stranded on whichever row was selected before filtering started. The
  // bare-character-input branch silently swallowed multi-byte arrow-key
  // escape sequences instead of routing them to navigation.
  const rows = [
    row('acryl-engine', 'cordis:acryl-engine-dsh'),
    row('include:dsh-editor', 'acryl-dsh-editor-plugin'),
    row('include:dsh-editor-cli', 'acryl-dsh-editor-plugin-cli'),
  ]

  it('moves the selection with arrow keys while a filter is active', () => {
    const overlay = new PluginsOverlay(stubTui(), rows, stubActions())
    overlay.handleInput('/')
    for (const ch of 'acryl') overlay.handleInput(ch)
    // All three fixture rows fuzzy-match "acryl" (id or name); derive the
    // expected fuzzy-ranked order the same way the overlay itself does,
    // rather than assuming/hardcoding a specific ranking here.
    const ranked = filterPluginRows(rows, 'acryl')
    expect(ranked).toHaveLength(3)
    // `include:dsh-editor` is a literal prefix of `include:dsh-editor-cli`, so a
    // plain substring check would false-positive-match the wrong row - require
    // the character right after the id isn't part of a longer id (id boundary).
    const selectedRowId = (): string | undefined => {
      const line = overlay.render(80).find(l => l.includes('> ')) ?? ''
      return ranked.find(r => {
        const at = line.indexOf(r.id)
        return at !== -1 && !/[\w-]/u.test(line[at + r.id.length] ?? '')
      })?.id
    }
    expect(selectedRowId()).toBe(ranked[0]?.id)
    overlay.handleInput(ARROW_DOWN)
    overlay.handleInput(ARROW_DOWN)
    expect(selectedRowId()).toBe(ranked[2]?.id)
    overlay.handleInput(ARROW_UP)
    expect(selectedRowId()).toBe(ranked[1]?.id)
  })

  it('escape clears the filter before closing the overlay', () => {
    const actions = stubActions()
    const overlay = new PluginsOverlay(stubTui(), rows, actions)
    overlay.handleInput('/')
    overlay.handleInput('x')
    overlay.handleInput('\x1b') // escape: clears the filter first
    expect(actions.closePlugins).not.toHaveBeenCalled()
    expect(overlay.render(80).some(line => line.startsWith('/'))).toBe(false)
    overlay.handleInput('\x1b') // escape again, no filter active: closes
    expect(actions.closePlugins).toHaveBeenCalledTimes(1)
  })
})
