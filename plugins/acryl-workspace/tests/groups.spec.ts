import { describe, expect, it } from 'vitest'
import { GLOBAL_GROUP, WorkspaceGroups } from '../src/client/workspace/groups.ts'

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
