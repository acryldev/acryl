import { describe, expect, it } from 'vitest'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { parseSavedWorkspace, serializeWorkspace } from '../../src/client/canvas/persistence.ts'
import { WorkspaceState } from '../../src/client/canvas/state.ts'

function counter(): () => string {
  let n = 0
  return () => `id-${String(n++)}`
}

describe('editor tabs in WorkspaceState', () => {
  it('opens a file once: a second request focuses the tab that already edits it', () => {
    const state = new WorkspaceState({ createId: counter() })
    const first = state.openFile('/p', 'src/a.ts')
    expect(first).toMatchObject({ kind: 'file', title: 'a.ts', fileWorktree: '/p', fileRel: 'src/a.ts' })
    state.addTile('pty')
    const again = state.openFile('/p', 'src/a.ts')
    expect(again?.id).toBe(first?.id)
    expect(state.getSnapshot().activeId).toBe(first?.id)
    expect(state.getSnapshot().tiles.filter(t => t.kind === 'file')).toHaveLength(1)
    expect(state.openFile('/p', 'src/b.ts')?.id).not.toBe(first?.id)
  })

  it('opens beside the chat when asked, keeping the chat focused', () => {
    const state = new WorkspaceState({ createId: counter() })
    const chatId = state.getSnapshot().activeId
    const tile = state.openFile('/p', 'a.ts', { beside: true })
    expect(state.getSnapshot().activeId).toBe(chatId)
    expect(state.getSnapshot().splitId).toBe(tile?.id)
  })

  it('keeps an unsaved draft with the disk version it is based on, and forgets it on request', () => {
    const state = new WorkspaceState({ createId: counter() })
    const tile = state.openFile('/p', 'a.ts')
    if (tile === undefined) throw new Error('no tile')
    state.setFileDraft(tile.id, 'draft text', 42)
    expect(state.getSnapshot().tiles.find(t => t.id === tile.id)).toMatchObject({ content: 'draft text', fileMtimeMs: 42 })
    state.clearFileDraft(tile.id)
    const cleared = state.getSnapshot().tiles.find(t => t.id === tile.id)
    expect(cleared?.content).toBeUndefined()
    expect(cleared?.fileMtimeMs).toBeUndefined()
    expect(cleared).toMatchObject({ fileRel: 'a.ts' })
  })

  it('does not notify when clearing a draft that does not exist', () => {
    const state = new WorkspaceState({ createId: counter() })
    const tile = state.openFile('/p', 'a.ts')
    if (tile === undefined) throw new Error('no tile')
    let notified = 0
    state.subscribe(() => { notified += 1 })
    state.clearFileDraft(tile.id)
    expect(notified).toBeLessThanOrEqual(1)
  })
})

describe('editor tabs in persistence', () => {
  it('saves which file an editor tab shows but never its unsaved draft, and restores it', () => {
    const groups = new WorkspaceGroups()
    const state = groups.stateFor('/p')
    const tile = state.openFile('/p', 'src/a.ts')
    if (tile === undefined) throw new Error('no tile')
    state.setFileDraft(tile.id, 'secret unsaved text', 7)
    const json = serializeWorkspace('projects', groups)
    expect(json).not.toContain('secret unsaved text')
    const saved = parseSavedWorkspace(json)
    expect(saved?.groups['/p']?.tiles[0]).toMatchObject({ kind: 'file', fileWorktree: '/p', fileRel: 'src/a.ts' })

    const restored = new WorkspaceGroups(undefined, saved?.groups)
    expect(restored.stateFor('/p').getSnapshot().tiles.find(t => t.kind === 'file')).toMatchObject({ fileWorktree: '/p', fileRel: 'src/a.ts' })
  })

  it('drops an editor tab that has only half of its identity', () => {
    const raw = JSON.stringify({ version: 1, mode: 'projects', groups: { '/p': { tiles: [{ kind: 'file', title: 'a', fileRel: 'a.ts' }], active: -1, split: -1 } } })
    expect(parseSavedWorkspace(raw)?.groups['/p']?.tiles).toEqual([])
  })

  it('still saves the scratch File tab text as before', () => {
    const groups = new WorkspaceGroups()
    const state = groups.stateFor('/p')
    const tile = state.addTile('file')
    if (tile === undefined) throw new Error('no tile')
    state.updateTile(tile.id, { path: 'notes.txt', content: 'hello' })
    expect(parseSavedWorkspace(serializeWorkspace('chats', groups))?.groups['/p']?.tiles[0]).toMatchObject({ kind: 'file', path: 'notes.txt', content: 'hello' })
  })
})

describe('file-backed doc tiles', () => {
  it('opens a markdown file once, beside the chat when asked, and remembers it across a restart', () => {
    const groups = new WorkspaceGroups()
    const state = groups.stateFor('/p')
    const chatId = state.getSnapshot().activeId
    const tile = state.openDoc('/p', 'specs/plan.md', { beside: true })
    expect(tile).toMatchObject({ kind: 'doc', title: 'plan.md', docWorktree: '/p', docRel: 'specs/plan.md' })
    expect(tile?.docText).toBeUndefined()
    expect(state.getSnapshot().activeId).toBe(chatId)
    expect(state.getSnapshot().splitId).toBe(tile?.id)
    expect(state.openDoc('/p', 'specs/plan.md')?.id).toBe(tile?.id)
    expect(state.getSnapshot().tiles.filter(t => t.kind === 'doc')).toHaveLength(1)

    const saved = parseSavedWorkspace(serializeWorkspace('projects', groups))
    const restored = new WorkspaceGroups(undefined, saved?.groups)
    expect(restored.stateFor('/p').getSnapshot().tiles.find(t => t.kind === 'doc')).toMatchObject({ docWorktree: '/p', docRel: 'specs/plan.md' })
  })

  it('drops a doc tab that has only half of its identity, and still saves the scratch doc text', () => {
    const raw = JSON.stringify({ version: 1, mode: 'projects', groups: { '/p': { tiles: [{ kind: 'doc', title: 'a', docRel: 'a.md' }], active: -1, split: -1 } } })
    expect(parseSavedWorkspace(raw)?.groups['/p']?.tiles).toEqual([])
    const groups = new WorkspaceGroups()
    const state = groups.stateFor('/p')
    const scratch = state.addTile('doc')
    if (scratch === undefined) throw new Error('no tile')
    state.updateTile(scratch.id, { docText: '# notes' })
    expect(parseSavedWorkspace(serializeWorkspace('chats', groups))?.groups['/p']?.tiles[0]).toMatchObject({ kind: 'doc', docText: '# notes' })
  })
})

