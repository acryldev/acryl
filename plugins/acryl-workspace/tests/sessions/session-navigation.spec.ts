import { describe, expect, it } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { synchronizeWorkspaceWithSessionNavigation } from '../../src/client/sessions/session-navigation.ts'

function counter(): () => string {
  let n = 0
  return () => `id-${String(n++)}`
}

describe('synchronizeWorkspaceWithSessionNavigation', () => {
  it('claims the bootstrap chat tile for the first session that becomes current', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const bootstrap = workspace.getSnapshot().tiles[0]
    const previous = synchronizeWorkspaceWithSessionNavigation(workspace, undefined, { current: 's1', blank: false })
    expect(previous).toBe('s1')
    expect(workspace.getSnapshot().tiles).toHaveLength(1)
    expect(workspace.getSnapshot().tiles[0]?.id).toBe(bootstrap?.id)
    expect(workspace.getSnapshot().tiles[0]?.chatSessionId).toBe('s1')
  })

  it('a second session becoming current opens its own tab, not the first one', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    let previous = synchronizeWorkspaceWithSessionNavigation(workspace, undefined, { current: 's1', blank: false })
    previous = synchronizeWorkspaceWithSessionNavigation(workspace, previous, { current: 's2', blank: false })
    expect(previous).toBe('s2')
    expect(workspace.getSnapshot().tiles.map(t => t.chatSessionId)).toEqual(['s1', 's2'])
    expect(workspace.getSnapshot().activeId).toBe(workspace.getSnapshot().tiles[1]?.id)
  })

  it('returning to a session already open focuses its existing tab, not a third one', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    let previous = synchronizeWorkspaceWithSessionNavigation(workspace, undefined, { current: 's1', blank: false })
    previous = synchronizeWorkspaceWithSessionNavigation(workspace, previous, { current: 's2', blank: false })
    const firstTileId = workspace.getSnapshot().tiles[0]?.id
    synchronizeWorkspaceWithSessionNavigation(workspace, previous, { current: 's1', blank: false })
    expect(workspace.getSnapshot().tiles).toHaveLength(2)
    expect(workspace.getSnapshot().activeId).toBe(firstTileId)
  })

  it('an unchanged, non-blank current session leaves the workspace alone', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    synchronizeWorkspaceWithSessionNavigation(workspace, undefined, { current: 's1', blank: false })
    workspace.addTile('doc')
    workspace.selectTile(workspace.getSnapshot().tiles[0]!.id)
    const before = workspace.getSnapshot()
    synchronizeWorkspaceWithSessionNavigation(workspace, 's1', { current: 's1', blank: false })
    expect(workspace.getSnapshot()).toBe(before) // no replace() call at all
  })

  it('re-selecting a blank session is the New Session signal even with an unchanged id', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    synchronizeWorkspaceWithSessionNavigation(workspace, undefined, { current: 's1', blank: false })
    workspace.addTile('doc')
    synchronizeWorkspaceWithSessionNavigation(workspace, 's1', { current: 's1', blank: true })
    expect(workspace.getSnapshot().activeId).toBe(workspace.getSnapshot().tiles.find(t => t.chatSessionId === 's1')?.id)
  })
})
