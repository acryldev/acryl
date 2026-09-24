import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceGroups } from '../src/client/workspace/groups.ts'
import { parseSavedWorkspace, serializeWorkspace, STORAGE_KEY, type StorageLike } from '../src/client/workspace/persistence.ts'
import { startWorkspacePersistence } from '../src/client/workspace/persist.ts'
import { WorkspaceShellState } from '../src/client/workspace/shell-state.ts'
import { WorkspaceState } from '../src/client/workspace/state.ts'

afterEach(() => { vi.useRealTimers() })

const ids = (): (() => string) => { let n = 0; return () => `id${String(++n)}` }
const groupsWith = (): WorkspaceGroups => new WorkspaceGroups(() => new WorkspaceState({ createId: ids() }))

const shellStub = (): WorkspaceShellState => new WorkspaceShellState({
  repo: async () => null,
  status: async path => ({ path, branch: null, changes: [], truncated: false }),
  diff: async (path, file) => ({ path, file, text: '', binary: false, truncated: false }),
  createWorktree: async () => { throw new Error('unused') },
})

function memoryStorage(): StorageLike & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>()
  return {
    data,
    writes: 0,
    getItem(key) { return data.get(key) ?? null },
    setItem(key, value) { this.writes += 1; data.set(key, value) },
  }
}

describe('parseSavedWorkspace', () => {
  it.each([
    ['null', null],
    ['not json', '{nope'],
    ['a number', '5'],
    ['wrong version', JSON.stringify({ version: 2, mode: 'chats', groups: {} })],
    ['bad mode', JSON.stringify({ version: 1, mode: 'x', groups: {} })],
    ['no groups', JSON.stringify({ version: 1, mode: 'chats' })],
    ['array groups', JSON.stringify({ version: 1, mode: 'chats', groups: [] })],
  ])('returns undefined for %s', (_name, raw) => {
    expect(parseSavedWorkspace(raw)).toBeUndefined()
  })

  it('keeps valid tiles and silently drops invalid ones', () => {
    const saved = parseSavedWorkspace(JSON.stringify({
      version: 1,
      mode: 'projects',
      groups: {
        '/p': {
          active: 1,
          tiles: [
            { kind: 'file', title: 'a.ts', path: 'a.ts', content: 'x' },
            { kind: 'pty', title: 'Terminal' },
            { kind: 'browser', title: 'Docs', url: 'https://example.com/' },
            { kind: 'diff', title: 'half', diffFile: 'a.ts' },
            { kind: 'kanban', title: 'Board', board: { todo: [{ id: 'c', text: 't' }], doing: [], done: 'bad' } },
            { kind: 'doc', title: 'Doc', docText: '# hi', unknown: 1 },
            'garbage',
          ],
        },
      },
    }))
    expect(saved?.mode).toBe('projects')
    expect(saved?.groups['/p']?.tiles.map(t => t.title)).toEqual(['a.ts', 'Docs', 'Doc'])
    expect(saved?.groups['/p']?.tiles[2]).toEqual({ kind: 'doc', title: 'Doc', docText: '# hi' })
  })

  it('resets an active index that points past the surviving tiles, and rejects oversized text', () => {
    const saved = parseSavedWorkspace(JSON.stringify({
      version: 1,
      mode: 'chats',
      groups: { g: { active: 9, tiles: [{ kind: 'file', title: 'big', content: 'x'.repeat(300_000) }] } },
    }))
    expect(saved?.groups.g?.active).toBe(-1)
    expect(saved?.groups.g?.tiles[0]?.content).toBeUndefined()
  })
})

describe('serialize and restore', () => {
  it('round-trips tabs per worktree, skipping the chat and terminal tabs, and restores focus', () => {
    const groups = groupsWith()
    const a = groups.stateFor('/p/main')
    a.addTile('pty', { commandId: 'shell' })
    const file = a.addTile('file')
    a.updateTile(file!.id, { path: 'src/a.ts', content: 'hello' })
    a.openDiff('/p/main', 'src/a.ts')
    a.addTile('kanban')
    const b = groups.stateFor('/p/feature')
    b.addTile('doc')

    const saved = parseSavedWorkspace(serializeWorkspace('projects', groups))
    expect(saved?.mode).toBe('projects')
    expect(saved?.groups['/p/main']?.tiles.map(t => t.kind)).toEqual(['file', 'diff', 'kanban'])
    expect(saved?.groups['/p/main']?.active).toBe(2)
    expect(saved?.groups['/p/feature']?.tiles.map(t => t.kind)).toEqual(['doc'])

    const restored = new WorkspaceGroups(() => new WorkspaceState({ createId: ids() }), saved?.groups)
    const state = restored.stateFor('/p/main').getSnapshot()
    expect(state.tiles.map(t => t.kind)).toEqual(['chat', 'file', 'diff', 'kanban'])
    expect(state.tiles[1]).toMatchObject({ path: 'src/a.ts', content: 'hello' })
    expect(state.tiles[2]).toMatchObject({ diffWorktree: '/p/main', diffFile: 'src/a.ts' })
    expect(state.tiles.find(t => t.id === state.activeId)?.kind).toBe('kanban')
    // A group that was never saved starts fresh.
    expect(restored.stateFor('/p/other').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat'])
  })

  it('round-trips the split pane, and treats a missing or clashing split as none', () => {
    const groups = groupsWith()
    const state = groups.stateFor('/p')
    const doc = state.addTile('doc')!
    state.addTile('kanban')
    state.openInSplit(doc.id)
    const saved = parseSavedWorkspace(serializeWorkspace('chats', groups))
    const group = saved?.groups['/p']
    expect(group?.split).toBeGreaterThanOrEqual(0)
    expect(group?.split).not.toBe(group?.active)
    const restored = new WorkspaceGroups(() => new WorkspaceState({ createId: ids() }), saved?.groups).stateFor('/p').getSnapshot()
    expect(restored.tiles.find(t => t.id === restored.splitId)?.kind).toBe('doc')

    const legacy = parseSavedWorkspace(JSON.stringify({ version: 1, mode: 'chats', groups: { g: { active: 0, tiles: [{ kind: 'doc', title: 'D' }] } } }))
    expect(legacy?.groups.g?.split).toBe(-1)
    const clash = parseSavedWorkspace(JSON.stringify({ version: 1, mode: 'chats', groups: { g: { active: 0, split: 0, tiles: [{ kind: 'doc', title: 'D' }] } } }))
    expect(clash?.groups.g?.split).toBe(-1)
  })

  it('keeps the chat focused when it was the active tab', () => {
    const groups = groupsWith()
    const state = groups.stateFor('/p')
    state.addTile('doc')
    state.selectTile(state.getSnapshot().tiles[0]!.id)
    const saved = parseSavedWorkspace(serializeWorkspace('chats', groups))
    expect(saved?.groups['/p']?.active).toBe(-1)
    const restored = new WorkspaceGroups(() => new WorkspaceState({ createId: ids() }), saved?.groups).stateFor('/p').getSnapshot()
    expect(restored.tiles.find(t => t.id === restored.activeId)?.kind).toBe('chat')
  })

  it('sheds large text instead of exceeding the storage cap', () => {
    const groups = groupsWith()
    const state = groups.stateFor('/p')
    for (let i = 0; i < 8; i += 1) {
      const tile = state.addTile('file')
      state.updateTile(tile!.id, { path: `f${String(i)}`, content: 'x'.repeat(190_000) })
    }
    const json = serializeWorkspace('chats', groups)
    expect(json.length).toBeLessThan(1_000_000)
    expect(parseSavedWorkspace(json)?.groups['/p']?.tiles).toHaveLength(8)
  })
})

describe('startWorkspacePersistence', () => {
  it('writes once after a burst of changes, and again when the view mode changes', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const groups = groupsWith()
    const shell = shellStub()
    const stop = startWorkspacePersistence({ groups, shell, storage, delayMs: 400 })
    const state = groups.stateFor('/p')
    state.addTile('doc')
    state.addTile('kanban')
    expect(storage.writes).toBe(0)
    vi.advanceTimersByTime(500)
    expect(storage.writes).toBe(1)
    expect(parseSavedWorkspace(storage.data.get(STORAGE_KEY) ?? null)?.groups['/p']?.tiles).toHaveLength(2)

    shell.setMode('projects')
    vi.advanceTimersByTime(500)
    expect(storage.writes).toBe(2)
    expect(parseSavedWorkspace(storage.data.get(STORAGE_KEY) ?? null)?.mode).toBe('projects')
    stop()
    shell.dispose()
  })

  it('flushes a pending save on shutdown and stops listening', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const groups = groupsWith()
    const shell = shellStub()
    const stop = startWorkspacePersistence({ groups, shell, storage })
    groups.stateFor('/p').addTile('doc')
    stop()
    expect(storage.writes).toBe(1)
    groups.stateFor('/p').addTile('kanban')
    vi.advanceTimersByTime(2000)
    expect(storage.writes).toBe(1)
    shell.dispose()
  })

  it('does nothing without storage, and survives a store that throws', () => {
    vi.useFakeTimers()
    const groups = groupsWith()
    const shell = shellStub()
    expect(() => { startWorkspacePersistence({ groups, shell, storage: undefined })() }).not.toThrow()
    const stop = startWorkspacePersistence({
      groups,
      shell,
      storage: { getItem: () => null, setItem: () => { throw new Error('quota') } },
    })
    groups.stateFor('/p').addTile('doc')
    expect(() => { vi.advanceTimersByTime(1000) }).not.toThrow()
    stop()
    shell.dispose()
  })
})
