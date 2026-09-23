import { describe, expect, it } from 'vitest'
import { WorkspaceState } from '../src/client/workspace/state.ts'

function counter(): () => string {
  let n = 0
  return () => `id-${String(n++)}`
}

describe('WorkspaceState', () => {
  it('starts with exactly one active Chat tile', () => {
    const state = new WorkspaceState({ createId: counter() })
    const snapshot = state.getSnapshot()
    expect(snapshot.tiles).toHaveLength(1)
    expect(snapshot.tiles[0]?.kind).toBe('chat')
    expect(snapshot.activeId).toBe(snapshot.tiles[0]?.id)
  })

  it('a second Chat tile is de-duplicated: it focuses the existing one instead', () => {
    const state = new WorkspaceState({ createId: counter() })
    const first = state.getSnapshot().tiles[0]
    const second = state.addTile('chat')
    expect(second).toBeUndefined()
    expect(state.getSnapshot().tiles).toHaveLength(1)
    expect(state.getSnapshot().activeId).toBe(first?.id)
  })

  it('adding a pty tile focuses it and records its command id', () => {
    const state = new WorkspaceState({ createId: counter() })
    const tile = state.addTile('pty', { commandId: 'claude', title: 'Claude' })
    expect(tile?.commandId).toBe('claude')
    expect(state.getSnapshot().activeId).toBe(tile?.id)
    expect(state.getSnapshot().tiles).toHaveLength(2)
  })

  it('closing the active tile focuses its left neighbor', () => {
    const state = new WorkspaceState({ createId: counter() })
    const chat = state.getSnapshot().tiles[0]
    const pty = state.addTile('pty')
    const file = state.addTile('file')
    state.selectTile(file?.id ?? '')
    state.closeTile(file?.id ?? '')
    expect(state.getSnapshot().activeId).toBe(pty?.id)
    expect(state.getSnapshot().tiles.map(t => t.id)).toEqual([chat?.id, pty?.id])
  })

  it('updateTile derives a file tile title from its path when no title is given', () => {
    const state = new WorkspaceState({ createId: counter() })
    const file = state.addTile('file')
    state.updateTile(file?.id ?? '', { path: '/a/b/README.md' })
    expect(state.getSnapshot().tiles.find(t => t.id === file?.id)?.title).toBe('README.md')
  })

  it('a kanban tile starts with three empty columns', () => {
    const state = new WorkspaceState({ createId: counter() })
    const board = state.addTile('kanban')
    expect(board?.board).toEqual({ todo: [], doing: [], done: [] })
  })

  it('addCard appends to the given column; moveCard relocates by id', () => {
    const state = new WorkspaceState({ createId: counter() })
    const board = state.addTile('kanban')
    const id = board?.id ?? ''
    state.addCard(id, 'todo', 'write tests')
    const afterAdd = state.getSnapshot().tiles.find(t => t.id === id)
    expect(afterAdd?.board?.todo).toHaveLength(1)
    const cardId = afterAdd?.board?.todo[0]?.id ?? ''
    state.moveCard(id, cardId, 'done', 0)
    const afterMove = state.getSnapshot().tiles.find(t => t.id === id)
    expect(afterMove?.board?.todo).toHaveLength(0)
    expect(afterMove?.board?.done).toHaveLength(1)
    expect(afterMove?.board?.done[0]?.text).toBe('write tests')
  })

  it('subscribers are notified once per state change and can unsubscribe', () => {
    const state = new WorkspaceState({ createId: counter() })
    let calls = 0
    const unsubscribe = state.subscribe(() => { calls += 1 })
    state.addTile('doc')
    expect(calls).toBe(1)
    unsubscribe()
    state.addTile('browser')
    expect(calls).toBe(1)
  })
})
