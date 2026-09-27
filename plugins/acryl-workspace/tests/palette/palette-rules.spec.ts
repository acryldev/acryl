import { describe, expect, it, vi } from 'vitest'
import { fuzzyScore, matchIndexes, scoreFields } from '../../src/client/palette/fuzzy.ts'
import { PaletteConfigState, parsePaletteConfig, PALETTE_CONFIG_KEY } from '../../src/client/palette/palette-config.ts'
import { buildPaletteItems, CONFIGURABLE_ENTRIES, type PaletteActions } from '../../src/client/palette/palette-commands.ts'
import { DEFAULT_PALETTE_CONFIG, rankItems, sectionsOf, type PaletteItem } from '../../src/client/palette/palette-items.ts'
import { FILE_DEBOUNCE_MS, PaletteState, type FileSearch } from '../../src/client/palette/palette-state.ts'
import { createFileSearch } from '../../src/client/palette/file-search.ts'
import { isPaletteShortcut } from '../../src/client/palette/palette-shortcut.ts'
import { WORKSPACE_SURFACE_ACTIONS } from '../../src/client/terminal/agent-commands.ts'

const item = (id: string, title: string, over: Partial<PaletteItem> = {}): PaletteItem => ({ id, group: 'command', title, run: () => {}, ...over })

describe('fuzzy matching', () => {
  it('matches characters in order, ignoring case, and rejects anything else', () => {
    expect(fuzzyScore('nwt', 'New worktree')).not.toBeNull()
    expect(fuzzyScore('NEW', 'new tab')).not.toBeNull()
    expect(fuzzyScore('xyz', 'New worktree')).toBeNull()
    expect(fuzzyScore('tw', 'worktree')).toBeNull()
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('ranks a start-of-word run above a scattered match', () => {
    const exact = fuzzyScore('term', 'Terminal') ?? 0
    const scattered = fuzzyScore('term', 'The big red maroon') ?? 0
    expect(exact).toBeGreaterThan(scattered)
    expect(fuzzyScore('git', 'git status') ?? 0).toBeGreaterThan(fuzzyScore('git', 'digital tab') ?? 0)
  })

  it('needs every term, counts the title extra, and reports highlight positions', () => {
    expect(scoreFields('new term', ['New Terminal', '', 'shell'])).not.toBeNull()
    expect(scoreFields('new zzz', ['New Terminal'])).toBeNull()
    expect(scoreFields('shell', ['Open', 'shell thing'])).not.toBeNull()
    expect(matchIndexes('nt', 'New Terminal')).toEqual([0, 4])
    expect(matchIndexes('qq', 'New Terminal')).toEqual([])
  })
})

describe('ranking and sections', () => {
  const items = [
    item('a', 'Toggle right panel'),
    item('b', 'New terminal', { keywords: ['shell'] }),
    item('c', 'Open Claude', { group: 'agent' }),
    item('d', 'Settings: Agents', { group: 'setting' }),
  ]

  it('lists everything in group order when nothing is typed, and the best match first when something is', () => {
    expect(rankItems(items, '', DEFAULT_PALETTE_CONFIG).map(i => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(rankItems(items, 'shell', DEFAULT_PALETTE_CONFIG).map(i => i.id)).toEqual(['b'])
    expect(rankItems(items, 'cla', DEFAULT_PALETTE_CONFIG)[0]?.id).toBe('c')
  })

  it('leaves out hidden groups and hidden items', () => {
    expect(rankItems(items, '', { hiddenGroups: ['agent'], hiddenItems: ['a'] }).map(i => i.id)).toEqual(['b', 'd'])
  })

  it('sections by group in fixed order when browsing and by first appearance when searching', () => {
    expect(sectionsOf(rankItems(items, '', DEFAULT_PALETTE_CONFIG), false).map(s => s.label)).toEqual(['Commands', 'Agents', 'Settings'])
    const searched = sectionsOf([items[2] as PaletteItem, items[0] as PaletteItem], true)
    expect(searched.map(s => s.group)).toEqual(['agent', 'command'])
  })
})

describe('palette configuration', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, data }
  }

  it('reads damaged storage as the defaults and keeps only valid entries', () => {
    expect(parsePaletteConfig('{nope')).toEqual(DEFAULT_PALETTE_CONFIG)
    expect(parsePaletteConfig('[1]')).toEqual(DEFAULT_PALETTE_CONFIG)
    expect(parsePaletteConfig(JSON.stringify({ hiddenGroups: ['file', 'bogus'], hiddenItems: ['x', 3] }))).toEqual({ hiddenGroups: ['file'], hiddenItems: ['x'] })
  })

  it('remembers changes, notifies listeners, and resets', () => {
    const storage = memory()
    const state = new PaletteConfigState(storage)
    const listener = vi.fn()
    state.subscribe(listener)
    state.toggleGroup('file')
    state.toggleItem('command:close-tab')
    expect(state.getSnapshot()).toEqual({ hiddenGroups: ['file'], hiddenItems: ['command:close-tab'] })
    expect(new PaletteConfigState(storage).getSnapshot().hiddenGroups).toEqual(['file'])
    state.toggleGroup('file')
    expect(state.getSnapshot().hiddenGroups).toEqual([])
    state.reset()
    expect(JSON.parse(storage.data.get(PALETTE_CONFIG_KEY) ?? '{}')).toEqual(DEFAULT_PALETTE_CONFIG)
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('works without storage', () => {
    const state = new PaletteConfigState(undefined)
    state.toggleGroup('agent')
    expect(state.getSnapshot().hiddenGroups).toEqual(['agent'])
  })
})

describe('built-in items', () => {
  const actions = () => ({
    openSurface: vi.fn<PaletteActions['openSurface']>(),
    openAgent: vi.fn<PaletteActions['openAgent']>(),
    openCustomTab: vi.fn<PaletteActions['openCustomTab']>(),
    openSettings: vi.fn<PaletteActions['openSettings']>(() => true),
    toggleRightPanel: vi.fn<PaletteActions['toggleRightPanel']>(),
    toggleTerminalPanel: vi.fn<PaletteActions['toggleTerminalPanel']>(),
    setTerminalMode: vi.fn<PaletteActions['setTerminalMode']>(),
    setShellMode: vi.fn<PaletteActions['setShellMode']>(),
    selectWorktree: vi.fn<PaletteActions['selectWorktree']>(),
    focusTab: vi.fn<PaletteActions['focusTab']>(),
    closeActiveTab: vi.fn<PaletteActions['closeActiveTab']>(),
    openFile: vi.fn<PaletteActions['openFile']>(),
  })
  const view = { customTabs: [{ kind: 'acme.board', label: 'Whiteboard', description: 'Draw' }], surfaces: WORKSPACE_SURFACE_ACTIONS.filter(s => s.kind !== 'diff'), agents: [{ id: 'claude', label: 'Claude' }], worktrees: [{ path: '/p', label: 'proj: main' }], tabs: [{ id: 't1', title: 'Claude', kind: 'pty' }] }

  it('builds every kind of item and runs the matching action', () => {
    const a = actions()
    const notify = vi.fn()
    const items = buildPaletteItems(a, view, notify)
    const byId = new Map(items.map(i => [i.id, i]))
    byId.get('command:surface:browser')?.run()
    byId.get('agent:claude')?.run()
    byId.get('command:custom:acme.board')?.run()
    byId.get('tab:t1')?.run()
    byId.get('worktree:/p')?.run()
    byId.get('command:right-panel')?.run()
    byId.get('command:terminal-panel')?.run()
    byId.get('command:terminal-side')?.run()
    byId.get('command:close-tab')?.run()
    byId.get('command:mode-projects')?.run()
    byId.get('setting:tabs')?.run()
    expect(a.openSurface).toHaveBeenCalledWith('browser')
    expect(a.openAgent).toHaveBeenCalledWith('claude', 'Claude')
    expect(a.openCustomTab).toHaveBeenCalledWith('acme.board', 'Whiteboard')
    expect(a.focusTab).toHaveBeenCalledWith('t1')
    expect(a.selectWorktree).toHaveBeenCalledWith('/p')
    expect(a.toggleRightPanel).toHaveBeenCalled()
    expect(a.toggleTerminalPanel).toHaveBeenCalled()
    expect(a.setTerminalMode).toHaveBeenCalledWith('side')
    expect(a.closeActiveTab).toHaveBeenCalled()
    expect(a.setShellMode).toHaveBeenCalledWith('projects')
    expect(a.openSettings).toHaveBeenCalledWith('tabs')
    expect(byId.has('command:surface:diff')).toBe(false)
    expect(new Set(items.map(i => i.id)).size).toBe(items.length)
  })

  it('says where to go when Settings cannot be opened', () => {
    const a = actions()
    a.openSettings.mockReturnValue(false)
    const notify = vi.fn()
    buildPaletteItems(a, view, notify).find(i => i.id === 'setting:agents')?.run()
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Settings'))
  })

  it('offers each fixed entry for configuration, all with distinct ids', () => {
    expect(new Set(CONFIGURABLE_ENTRIES.map(e => e.id)).size).toBe(CONFIGURABLE_ENTRIES.length)
    expect(CONFIGURABLE_ENTRIES.map(e => e.id)).toContain('setting:palette')
  })
})

describe('PaletteState', () => {
  const setup = (searchFiles: FileSearch = async () => []) => {
    const timers: Array<() => void> = []
    const run = vi.fn()
    const items = [item('a', 'New terminal', { run }), item('b', 'New browser tab'), item('c', 'Close current tab')]
    let config = DEFAULT_PALETTE_CONFIG
    const state = new PaletteState({ items: () => items, config: () => config, searchFiles, setTimer: (cb) => { timers.push(cb); return timers.length }, clearTimer: () => {} })
    return { state, run, timers, setConfig: (next: typeof config) => { config = next } }
  }

  it('opens empty, filters as you type, moves the selection around and runs the selected item', () => {
    const { state, run } = setup()
    expect(state.getSnapshot().open).toBe(false)
    state.show()
    expect(state.getSnapshot().flat.map(i => i.id)).toEqual(['a', 'b', 'c'])
    state.setQuery('new')
    // Equal scores fall back to the title, alphabetically.
    expect(state.getSnapshot().flat.map(i => i.id)).toEqual(['b', 'a'])
    state.move(1)
    state.move(1)
    expect(state.getSnapshot().selected).toBe(0)
    state.move(-1)
    expect(state.getSnapshot().selected).toBe(1)
    state.runSelected()
    expect(run).toHaveBeenCalledTimes(1)
    expect(state.getSnapshot().open).toBe(false)
  })

  it('cycles the scope, and the commands scope leaves files out', () => {
    const { state } = setup()
    state.show()
    state.cycleScope()
    expect(state.getSnapshot().scope).toBe('commands')
    state.cycleScope(-1)
    state.cycleScope(-1)
    expect(state.getSnapshot().scope).toBe('content')
    state.setScope('all')
    expect(state.getSnapshot().scope).toBe('all')
  })

  it('searches files after a pause, only from two characters, and shows the hits in a Files section', async () => {
    const search = vi.fn<FileSearch>(async () => [item('f1', 'state.ts', { group: 'file', subtitle: 'src' })])
    const { state, timers } = setup(search)
    state.show()
    state.setQuery('s')
    expect(timers).toHaveLength(0)
    state.setQuery('st')
    expect(state.getSnapshot().searching).toBe(true)
    timers.at(-1)?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(search).toHaveBeenCalledWith('st', 'name', expect.any(AbortSignal))
    const snapshot = state.getSnapshot()
    expect(snapshot.searching).toBe(false)
    expect(snapshot.sections.map(s => s.group)).toContain('file')
    expect(FILE_DEBOUNCE_MS).toBeGreaterThan(0)
  })

  it('ignores the answer to a search that a newer query replaced, and treats a failing search as no files', async () => {
    let resolveFirst: (items: PaletteItem[]) => void = () => {}
    let call = 0
    const search: FileSearch = () => {
      call += 1
      if (call === 1) return new Promise<PaletteItem[]>((resolve) => { resolveFirst = resolve })
      return Promise.reject(new Error('boom'))
    }
    const { state, timers } = setup(search)
    state.show()
    state.setQuery('ab')
    timers.at(-1)?.()
    state.setQuery('abc')
    timers.at(-1)?.()
    resolveFirst([item('old', 'old.ts', { group: 'file' })])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(state.getSnapshot().flat.some(i => i.id === 'old')).toBe(false)
    expect(state.getSnapshot().searching).toBe(false)
  })

  it('content scope asks for a content search and does not rank the commands', async () => {
    const search = vi.fn<FileSearch>(async () => [])
    const { state, timers } = setup(search)
    state.show()
    state.setScope('content')
    state.setQuery('needle')
    timers.at(-1)?.()
    await Promise.resolve()
    expect(search).toHaveBeenCalledWith('needle', 'content', expect.any(AbortSignal))
    expect(state.getSnapshot().flat).toEqual([])
  })

  it('honours the configuration and refreshes when it changes', () => {
    const { state, setConfig } = setup()
    state.show()
    setConfig({ hiddenGroups: [], hiddenItems: ['a'] })
    state.refresh()
    expect(state.getSnapshot().flat.map(i => i.id)).toEqual(['b', 'c'])
  })
})

describe('file search source', () => {
  it('turns name hits into file items that open the file, and content hits into file:line items', async () => {
    const open = vi.fn()
    const search = createFileSearch({
      search: async (_path, query, mode) => ({ path: '/w', query, mode, truncated: false, hits: mode === 'name' ? [{ file: 'src/state.ts' }] : [{ file: 'src/state.ts', line: 12, text: '  const x = 1' }] }),
    }, () => '/w', open)
    const [byName] = await search('state', 'name', new AbortController().signal)
    expect(byName).toMatchObject({ group: 'file', title: 'state.ts', subtitle: 'src' })
    byName?.run()
    expect(open).toHaveBeenCalledWith('/w', 'src/state.ts', undefined)
    const [byContent] = await search('x', 'content', new AbortController().signal)
    expect(byContent).toMatchObject({ title: 'state.ts:12', subtitle: 'src - const x = 1' })
    expect(await createFileSearch({ search: async () => { throw new Error('no') } }, () => undefined, open)('a', 'name', new AbortController().signal)).toEqual([])
  })
})

describe('shortcut', () => {
  const key = (over: Partial<Parameters<typeof isPaletteShortcut>[0]>) => ({ key: 'k', code: 'KeyK', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, isComposing: false, ...over })
  it('is Cmd or Ctrl plus Shift plus K, and nothing else', () => {
    expect(isPaletteShortcut(key({}))).toBe(true)
    expect(isPaletteShortcut(key({ metaKey: false, ctrlKey: true, key: 'K' }))).toBe(true)
    expect(isPaletteShortcut(key({ shiftKey: false }))).toBe(false)
    expect(isPaletteShortcut(key({ metaKey: false }))).toBe(false)
    expect(isPaletteShortcut(key({ altKey: true }))).toBe(false)
    expect(isPaletteShortcut(key({ isComposing: true }))).toBe(false)
    expect(isPaletteShortcut(key({ key: 'j', code: 'KeyJ' }))).toBe(false)
  })
})
