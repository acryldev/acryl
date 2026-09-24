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

describe('WorkspaceState git diff tiles', () => {
  const ids = (): (() => string) => { let n = 0; return () => `id${String(++n)}` }

  it('opens a git diff tile titled by the file name', () => {
    const workspace = new WorkspaceState({ createId: ids() })
    const tile = workspace.openDiff('/p/proj', 'src/deep/a.ts')
    expect(tile).toMatchObject({ kind: 'diff', title: 'a.ts', diffWorktree: '/p/proj', diffFile: 'src/deep/a.ts' })
    expect(tile?.diffBefore).toBeUndefined()
    expect(workspace.getSnapshot().activeId).toBe(tile?.id)
  })

  it('focuses the existing tile for the same file instead of opening a second', () => {
    const workspace = new WorkspaceState({ createId: ids() })
    const first = workspace.openDiff('/p/proj', 'a.ts')
    workspace.addTile('kanban')
    const again = workspace.openDiff('/p/proj', 'a.ts')
    expect(again?.id).toBe(first?.id)
    expect(workspace.getSnapshot().activeId).toBe(first?.id)
    expect(workspace.getSnapshot().tiles.filter(t => t.kind === 'diff')).toHaveLength(1)
  })

  it('treats the same file in another worktree as a different tile', () => {
    const workspace = new WorkspaceState({ createId: ids() })
    workspace.openDiff('/p/proj', 'a.ts')
    workspace.openDiff('/p/proj-x', 'a.ts')
    expect(workspace.getSnapshot().tiles.filter(t => t.kind === 'diff')).toHaveLength(2)
  })

  it('keeps the manual before/after diff for a plain New Diff tile', () => {
    const workspace = new WorkspaceState({ createId: ids() })
    const tile = workspace.addTile('diff')
    expect(tile).toMatchObject({ diffBefore: '', diffAfter: '' })
    expect(tile?.diffFile).toBeUndefined()
  })
})

describe('WorkspaceState split pane', () => {
  const make = (): WorkspaceState => {
    let n = 0
    return new WorkspaceState({ createId: () => `id${String(++n)}` })
  }
  const kinds = (w: WorkspaceState): string[] => w.getSnapshot().tiles.map(t => t.kind)

  it('shows another tab beside the active one without changing the active tab', () => {
    const w = make()
    const doc = w.addTile('doc')!
    w.selectTile(w.getSnapshot().tiles[0]!.id)
    w.openInSplit(doc.id)
    expect(w.getSnapshot()).toMatchObject({ activeId: 'id1', splitId: doc.id })
  })

  it('focuses a neighbour when the active tab itself is sent to the split', () => {
    const w = make()
    const doc = w.addTile('doc')!
    expect(w.getSnapshot().activeId).toBe(doc.id)
    w.openInSplit(doc.id)
    expect(w.getSnapshot()).toMatchObject({ activeId: 'id1', splitId: doc.id })
  })

  it('does nothing when there is no other tab to show beside', () => {
    const w = make()
    w.openInSplit('id1')
    expect(w.getSnapshot().splitId).toBeUndefined()
    w.openInSplit('missing')
    expect(w.getSnapshot().splitId).toBeUndefined()
  })

  it('swaps the panes when the tab in the split is selected', () => {
    const w = make()
    const doc = w.addTile('doc')!
    w.openInSplit(doc.id)
    w.selectTile(doc.id)
    expect(w.getSnapshot()).toMatchObject({ activeId: doc.id, splitId: 'id1' })
  })

  it('closes the split without closing its tab', () => {
    const w = make()
    const doc = w.addTile('doc')!
    w.openInSplit(doc.id)
    w.closeSplit()
    expect(w.getSnapshot().splitId).toBeUndefined()
    expect(kinds(w)).toEqual(['chat', 'doc'])
  })

  it('clears the split when its tab is closed, and never lands the active tab on the split tab', () => {
    const w = make()
    const doc = w.addTile('doc')!
    const board = w.addTile('kanban')!
    w.openInSplit(doc.id) // active becomes a neighbour of doc; board is the other tab
    w.closeTile(doc.id)
    expect(w.getSnapshot().splitId).toBeUndefined()

    const v = make()
    const a = v.addTile('doc')!
    const b = v.addTile('kanban')!
    v.selectTile('id1')
    v.openInSplit(b.id)
    v.closeTile('id1') // the active chat closes; the next active must not be the split tab
    expect(v.getSnapshot().activeId).toBe(a.id)
    expect(v.getSnapshot().splitId).toBe(b.id)
    void board
  })

  it('never has the same tab in both panes, whatever the sequence of operations', () => {
    const w = make()
    const tiles = [w.addTile('doc')!, w.addTile('kanban')!, w.addTile('file')!]
    const ops: Array<() => void> = [
      () => { w.openInSplit(tiles[0]!.id) },
      () => { w.selectTile(tiles[0]!.id) },
      () => { w.openInSplit(tiles[1]!.id) },
      () => { w.selectTile(tiles[1]!.id) },
      () => { w.closeTile(tiles[2]!.id) },
      () => { w.addTile('browser') },
      () => { w.closeSplit() },
      () => { w.openInSplit(w.getSnapshot().activeId ?? '') },
      () => { w.closeTile(w.getSnapshot().splitId ?? '') },
    ]
    for (let round = 0; round < 4; round += 1) {
      for (const op of ops) {
        op()
        const { activeId, splitId } = w.getSnapshot()
        if (splitId !== undefined) expect(splitId).not.toBe(activeId)
      }
    }
  })

  it('opens a diff beside the current tab when asked, and reuses one that already exists', () => {
    const w = make()
    const diff = w.openDiff('/p', 'a.ts', { beside: true })!
    expect(w.getSnapshot()).toMatchObject({ activeId: 'id1', splitId: diff.id })
    w.closeSplit()
    const again = w.openDiff('/p', 'a.ts', { beside: true })!
    expect(again.id).toBe(diff.id)
    expect(w.getSnapshot()).toMatchObject({ activeId: 'id1', splitId: diff.id })
    expect(w.getSnapshot().tiles.filter(t => t.kind === 'diff')).toHaveLength(1)
  })

  it('still focuses the diff itself when not asked to open it beside', () => {
    const w = make()
    const diff = w.openDiff('/p', 'a.ts')!
    expect(w.getSnapshot()).toMatchObject({ activeId: diff.id, splitId: undefined })
  })

  it('restores a saved split', () => {
    const w = make()
    w.restore([{ kind: 'doc', title: 'Doc' }, { kind: 'kanban', title: 'Board' }], 0, 1)
    const s = w.getSnapshot()
    expect(s.tiles.find(t => t.id === s.activeId)?.kind).toBe('doc')
    expect(s.tiles.find(t => t.id === s.splitId)?.kind).toBe('kanban')
    const same = make()
    same.restore([{ kind: 'doc', title: 'Doc' }], 0, 0)
    expect(same.getSnapshot().splitId).toBeUndefined()
  })
})
