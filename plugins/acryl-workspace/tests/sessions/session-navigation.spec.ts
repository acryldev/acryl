import { describe, expect, it } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { ensureWorktreeChatTabs, syncChatTabTitles, synchronizeWorkspaceWithSessionNavigation } from '../../src/client/sessions/session-navigation.ts'
import type { RepoState, WorktreeState } from '../../src/client/worktrees/shell-state.ts'

function counter(): () => string {
  let n = 0
  return () => `id-${String(n++)}`
}

function worktree(path: string): WorktreeState {
  return { path, branch: 'main', main: true, phase: 'ready', changes: [], added: 0, removed: 0, truncated: false }
}

const REPOS: readonly RepoState[] = [{ root: '/p/proj', name: 'proj', git: true, worktrees: [worktree('/p/proj')] }]

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

describe('ensureWorktreeChatTabs', () => {
  it('gives every session owned by this worktree its own tab - blank ones too, as "New chat" - with its real title', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = {
      ids: ['s1', 's2', 's3'],
      current: undefined,
      byId: {
        s1: { cwd: '/p/proj', blank: false, displayTitle: 'Explore the tools' },
        s2: { cwd: '/p/proj', blank: false, displayTitle: 'Greeting chat' },
        s3: { cwd: '/p/proj', blank: true, displayTitle: 'x' }, // blank: listed in the tree, so it gets a tab too
      },
    }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    const chats = workspace.getSnapshot().tiles.filter(t => t.kind === 'chat')
    // the unbound bootstrap tile claims the first real session (addTile's own claim semantics) rather than
    // sitting idle alongside it, so only s1 and s2 end up as tiles here - both carrying their real titles.
    expect(chats.map(t => [t.chatSessionId, t.title])).toEqual([
      ['s1', 'Explore the tools'],
      ['s2', 'Greeting chat'],
      ['s3', 'New chat'],
    ])
  })

  it('never duplicates a session that already has a tab', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = { ids: ['s1'], current: undefined, byId: { s1: { cwd: '/p/proj', blank: false, displayTitle: 'one' } } }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    expect(workspace.getSnapshot().tiles.filter(t => t.chatSessionId === 's1')).toHaveLength(1)
  })

  it('ignores a session owned by a different worktree', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = { ids: ['s1'], current: undefined, byId: { s1: { cwd: '/p/other', blank: false, displayTitle: 'elsewhere' } } }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    expect(workspace.getSnapshot().tiles.filter(t => t.kind === 'chat')).toHaveLength(1) // just the bootstrap tile
  })

  it('restores the already-active tab after adding others, instead of leaving the last-created one focused', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = {
      ids: ['s1', 's2'],
      current: 's1',
      byId: {
        s1: { cwd: '/p/proj', blank: false, displayTitle: 'one' },
        s2: { cwd: '/p/proj', blank: false, displayTitle: 'two' },
      },
    }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    const active = workspace.getSnapshot().tiles.find(t => t.id === workspace.getSnapshot().activeId)
    expect(active?.chatSessionId).toBe('s1')
  })

  it('never gives a dismissed chat a tab, even though the session itself still exists (T134-followup)', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = {
      ids: ['s1', 's2'],
      current: undefined,
      byId: {
        s1: { cwd: '/p/proj', blank: false, displayTitle: 'one' },
        s2: { cwd: '/p/proj', blank: false, displayTitle: 'two' },
      },
    }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions, new Set(['s2']))
    const chatSessionIds = workspace.getSnapshot().tiles.filter(t => t.kind === 'chat').map(t => t.chatSessionId)
    expect(chatSessionIds).not.toContain('s2')
  })
})

describe('syncChatTabTitles', () => {
  const rows = (title: string, blank = false) => ({ byId: { s1: { blank, displayTitle: title } } })

  it('renames an open chat tab when its session title changes, but not on the first sight or when unchanged', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    workspace.addTile('chat', { chatSessionId: 's1', title: 'Old' })
    const seen = new Map<string, string>()
    syncChatTabTitles(workspace, rows('Old'), seen) // first sight: just remembered
    expect(workspace.getSnapshot().tiles[0]?.title).toBe('Old')
    syncChatTabTitles(workspace, rows('New name'), seen)
    expect(workspace.getSnapshot().tiles[0]?.title).toBe('New name')
    syncChatTabTitles(workspace, rows('New name'), seen)
    expect(workspace.getSnapshot().tiles[0]?.title).toBe('New name')
  })

  it('does not revert a name typed into the tab while the session still reports the old title', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    workspace.addTile('chat', { chatSessionId: 's1', title: 'Old' })
    const seen = new Map<string, string>()
    syncChatTabTitles(workspace, rows('Old'), seen)
    workspace.renameTile(workspace.getSnapshot().tiles[0]!.id, 'Typed by user')
    syncChatTabTitles(workspace, rows('Old'), seen) // Host has not answered yet: same old title
    expect(workspace.getSnapshot().tiles[0]?.title).toBe('Typed by user')
    syncChatTabTitles(workspace, rows('Typed by user'), seen)
    expect(workspace.getSnapshot().tiles[0]?.title).toBe('Typed by user')
  })

  it('a renamed blank chat goes by its own title, not "New chat"', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    const sessions = { ids: ['s1'], current: undefined, byId: { s1: { cwd: '/p/proj', blank: true, displayTitle: 'x', title: '123' } } }
    ensureWorktreeChatTabs(workspace, '/p/proj', REPOS, sessions)
    expect(workspace.getSnapshot().tiles.find(t => t.chatSessionId === 's1')?.title).toBe('123')
  })

  it('replaces the generic default title on first sight, and leaves non-chat tabs alone', () => {
    const workspace = new WorkspaceState({ createId: counter() })
    workspace.addTile('chat', { chatSessionId: 's1' }) // what the session sync opens: "AcrylDSH Chat"
    workspace.addTile('doc', { title: 'README' })
    const seen = new Map<string, string>()
    syncChatTabTitles(workspace, rows('Old', true), seen)
    expect(workspace.getSnapshot().tiles.map(t => t.title)).toEqual(['New chat', 'README'])
  })
})
