import { describe, expect, it } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { findLinks } from '../../src/client/terminal/terminal-links.ts'
import { findMatches, isSearchShortcut, stepMatch } from '../../src/client/terminal/terminal-search.ts'

describe('links in terminal output', () => {
  it('finds http and https addresses and leaves sentence punctuation out', () => {
    expect(findLinks('see https://example.com/a?b=1, or http://localhost:3080/x.')).toEqual([
      { start: 4, end: 29, url: 'https://example.com/a?b=1' },
      { start: 34, end: 57, url: 'http://localhost:3080/x' },
    ])
  })

  it('keeps a closing bracket that matches an opening one, and drops one that does not', () => {
    expect(findLinks('https://en.wikipedia.org/wiki/Foo_(bar)')[0]?.url).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
    expect(findLinks('(see https://example.com/page)')[0]?.url).toBe('https://example.com/page')
  })

  it('ignores other schemes and text that is not an address', () => {
    expect(findLinks('file:///etc/passwd javascript:alert(1) ftp://x.y http:// https://')).toEqual([])
  })
})

describe('terminal search', () => {
  const lines = ['build started', 'Error: boom', 'nothing', 'another error and ERROR']

  it('finds every case-insensitive occurrence with its row and column', () => {
    expect(findMatches(lines, 'error')).toEqual([
      { row: 1, col: 0, length: 5 },
      { row: 3, col: 8, length: 5 },
      { row: 3, col: 18, length: 5 },
    ])
    expect(findMatches(lines, '')).toEqual([])
    expect(findMatches(lines, 'zzz')).toEqual([])
  })

  it('steps through matches and wraps at both ends', () => {
    expect(stepMatch(3, -1, 1)).toBe(0)
    expect(stepMatch(3, -1, -1)).toBe(2)
    expect(stepMatch(3, 2, 1)).toBe(0)
    expect(stepMatch(3, 0, -1)).toBe(2)
    expect(stepMatch(0, -1, 1)).toBe(-1)
  })

  it('uses Cmd+F on macOS and Ctrl+Shift+F elsewhere, never plain Ctrl+F', () => {
    const key = (over: Partial<Parameters<typeof isSearchShortcut>[0]>) => ({ key: 'f', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over })
    expect(isSearchShortcut(key({ metaKey: true }), true)).toBe(true)
    expect(isSearchShortcut(key({ ctrlKey: true }), true)).toBe(false)
    expect(isSearchShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(true)
    expect(isSearchShortcut(key({ ctrlKey: true }), false)).toBe(false)
    expect(isSearchShortcut(key({ metaKey: true, key: 'g' }), true)).toBe(false)
  })
})

describe('tab title from the terminal', () => {
  const setup = () => {
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('pty', { commandId: 'shell', title: 'Terminal' })
    if (tile === undefined) throw new Error('no tile')
    workspace.updateTile(tile.id, { terminalId: 't1' })
    const title = () => workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.title
    return { workspace, tile, title }
  }

  // A shell's own title is commonly `user@host: cwd` (zsh's default precmd), long and not useful in a narrow
  // tab strip, so a plain shell tab deliberately keeps its short default name instead of following it.
  it('never follows the shell program title; the tab keeps its short default name', () => {
    const { workspace, title } = setup()
    expect(workspace.applyTerminalTitle('t1', 'acryl: pnpm test')).toBe(false)
    expect(title()).toBe('Terminal')
    expect(workspace.applyTerminalTitle('t1', 'musichen@MacBook-Pro: ~/some/long/path')).toBe(false)
    expect(title()).toBe('Terminal')
  })

  it('never overwrites a title the user typed, and ignores agents and unknown terminals', () => {
    const { workspace, tile, title } = setup()
    workspace.renameTile(tile.id, 'api work')
    expect(workspace.applyTerminalTitle('t1', 'something else')).toBe(false)
    expect(title()).toBe('api work')
    expect(workspace.applyTerminalTitle('nope', 'x')).toBe(false)
    const agent = workspace.addTile('pty', { commandId: 'claude', title: 'Claude' })
    if (agent !== undefined) workspace.updateTile(agent.id, { terminalId: 't2' })
    expect(workspace.applyTerminalTitle('t2', 'Claude Code')).toBe(false)
  })
})
