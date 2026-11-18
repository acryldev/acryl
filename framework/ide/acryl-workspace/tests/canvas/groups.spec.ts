import { describe, expect, it } from 'vitest'
import { GLOBAL_GROUP, WorkspaceGroups, groupLocation, savedGroupKey } from '../../src/client/canvas/groups.ts'
import { DEFAULT_WORKSPACE_ID } from '../../src/projects/contract.ts'

describe('WorkspaceGroups', () => {
  it('creates one workspace per key and returns the same one afterwards', () => {
    const groups = new WorkspaceGroups()
    const a = groups.stateFor('/p/proj')
    expect(groups.stateFor('/p/proj')).toBe(a)
    expect(groups.stateFor('/p/proj-x')).not.toBe(a)
    expect(groups.keys()).toEqual(['/p/proj', '/p/proj-x'])
  })

  it('keeps each group\'s tabs independent', () => {
    const groups = new WorkspaceGroups()
    groups.stateFor('/a').addTile('kanban')
    expect(groups.stateFor('/a').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat', 'kanban'])
    expect(groups.stateFor('/b').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat'])
    expect(groups.stateFor(GLOBAL_GROUP).getSnapshot().tiles).toHaveLength(1)
  })
})

describe('WorkspaceGroups per workspace (spec 043 T006)', () => {
  it('gives each workspace its own tab set for the same worktree', () => {
    const groups = new WorkspaceGroups()
    groups.stateFor('/a').addTile('kanban')
    groups.setWorkspace('ws-2')
    expect(groups.stateFor('/a').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat'])
    groups.stateFor('/a').addTile('doc')
    groups.setWorkspace(DEFAULT_WORKSPACE_ID)
    expect(groups.stateFor('/a').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat', 'kanban'])
  })

  it('lists the shown workspace\'s worktrees, and every tab set by its saved key', () => {
    const groups = new WorkspaceGroups()
    groups.stateFor('/a')
    groups.setWorkspace('ws-2')
    groups.stateFor('/b')
    expect(groups.keys()).toEqual(['/b'])
    groups.setWorkspace(DEFAULT_WORKSPACE_ID)
    expect(groups.keys()).toEqual(['/a'])
    expect(groups.entries().map(([key]) => groupLocation(key))).toEqual([
      { workspace: DEFAULT_WORKSPACE_ID, worktree: '/a' },
      { workspace: 'ws-2', worktree: '/b' },
    ])
  })

  it('reads tab sets saved before workspaces as Default\'s', () => {
    const saved = { '/a': { tiles: [{ kind: 'doc' as const, title: 'Notes' }], active: 0, split: -1 } }
    const groups = new WorkspaceGroups(undefined, saved)
    groups.setWorkspace('ws-2')
    expect(groups.stateFor('/a').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat'])
    groups.setWorkspace(DEFAULT_WORKSPACE_ID)
    expect(groups.stateFor('/a').getSnapshot().tiles.map(t => t.kind)).toEqual(['chat', 'doc'])
  })

  it('notifies when the shown workspace changes, not when it is set to the same one', () => {
    const groups = new WorkspaceGroups()
    let calls = 0
    groups.onChange(() => { calls += 1 })
    groups.setWorkspace(DEFAULT_WORKSPACE_ID)
    expect(calls).toBe(0)
    groups.setWorkspace('ws-2')
    expect(calls).toBe(1)
    expect(groups.workspace()).toBe('ws-2')
  })

  it('keeps the saved tab sets nothing opened yet', () => {
    const saved = {
      '/a': { tiles: [], active: -1, split: -1 },
      [savedGroupKey('ws-2', '/b')]: { tiles: [{ kind: 'doc' as const, title: 'B' }], active: 0, split: -1 },
    }
    const groups = new WorkspaceGroups(undefined, saved)
    groups.stateFor('/a')
    expect(Object.keys(groups.unopened())).toEqual([savedGroupKey('ws-2', '/b')])
  })
})
