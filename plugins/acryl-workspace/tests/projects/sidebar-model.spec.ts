import { describe, expect, it } from 'vitest'
import { buildProjectRows, chatLabel, entriesForWorktree, owningWorktree, reposInWorkspace } from '../../src/client/projects/sidebar-model.ts'
import type { RepoState, ShellSnapshot, WorktreeState } from '../../src/client/worktrees/shell-state.ts'

function worktree(path: string, branch: string | null, patch: Partial<WorktreeState> = {}): WorktreeState {
  return { path, branch, main: false, phase: 'ready', changes: [], added: 0, removed: 0, truncated: false, ...patch }
}

const REPO: RepoState = {
  root: '/p/proj',
  name: 'proj',
  git: true,
  worktrees: [
    worktree('/p/proj', 'main', { main: true }),
    worktree('/p/proj/.worktrees/x', 'feature/x', {
      changes: [{ path: 'a.ts', code: 'M', staged: false, added: 2, removed: 1 }],
      added: 2,
      removed: 1,
    }),
    worktree('/p/other', null),
  ],
}

const snapshot = (over: Partial<ShellSnapshot> = {}): ShellSnapshot => ({
  mode: 'projects',
  repos: [REPO],
  selectedPath: undefined,
  dismissedChats: new Set(),
  ...over,
})

describe('owningWorktree', () => {
  it('picks the deepest worktree that contains the directory', () => {
    expect(owningWorktree([REPO], '/p/proj/src')).toBe('/p/proj')
    expect(owningWorktree([REPO], '/p/proj/.worktrees/x/src/deep')).toBe('/p/proj/.worktrees/x')
  })

  it('does not treat a sibling with a shared prefix as inside', () => {
    expect(owningWorktree([REPO], '/p/proj-other')).toBeUndefined()
  })

  it('returns undefined outside every worktree', () => {
    expect(owningWorktree([REPO], '/elsewhere')).toBeUndefined()
  })
})

describe('buildProjectRows', () => {
  it('labels branches, falls back to the folder name for a detached worktree, and marks selection', () => {
    const [repo] = buildProjectRows(snapshot({ selectedPath: '/p/other' }), [])
    expect(repo?.rows.map(r => r.label)).toEqual(['main', 'feature/x', 'other (detached)'])
    expect(repo?.rows.map(r => r.selected)).toEqual([false, false, true])
  })

  it('shows dirty for a worktree with changes and clean for one without', () => {
    const [repo] = buildProjectRows(snapshot(), [])
    expect(repo?.rows.map(r => r.dot)).toEqual(['clean', 'dirty', 'clean'])
    expect(repo?.rows[1]).toMatchObject({ changeCount: 1, added: 2, removed: 1 })
  })

  it('prefers running over done over dirty, and ignores blank or directory-less sessions', () => {
    const rows = buildProjectRows(snapshot(), [
      { id: 'c1', cwd: '/p/proj/.worktrees/x', running: true, blank: false },
      { id: 'c2', cwd: '/p/proj/.worktrees/x', running: false, completed: true, blank: false },
      { id: 'c3', cwd: '/p/proj', running: false, completed: true, blank: false },
      { id: 'c4', cwd: '/p/proj', running: true, blank: true },
      { running: true, blank: false },
    ], new Map(), new Map(), new Map([['/p/proj', new Set(['c3'])], ['/p/proj/.worktrees/x', new Set(['c2'])]]))[0]?.rows
    expect(rows?.[0]).toMatchObject({ dot: 'done', sessions: 1 })
    expect(rows?.[1]).toMatchObject({ dot: 'running', sessions: 2 })
  })

  it('counts only open chats: running, or with a tab in that worktree, not every chat that ever ran there', () => {
    const history = Array.from({ length: 90 }, (_, index) => ({ id: `old-${String(index)}`, cwd: '/p/proj', running: false, blank: false }))
    const rows = buildProjectRows(snapshot(), [...history, { id: 'live', cwd: '/p/proj', running: true, blank: false }], new Map(), new Map(), new Map([['/p/proj', new Set(['old-3'])]]))[0]?.rows
    expect(rows?.[0]?.sessions).toBe(2)
  })

  it('reports loading before the first status arrives and error when status failed', () => {
    const repo: RepoState = {
      ...REPO,
      worktrees: [worktree('/a', 'a', { phase: 'idle' }), worktree('/b', 'b', { phase: 'error', error: 'x' })],
    }
    const [row] = buildProjectRows(snapshot({ repos: [repo] }), [])
    expect(row?.rows.map(r => r.dot)).toEqual(['loading', 'error'])
  })
})

describe('entriesForWorktree', () => {
  const tiles = [
    { id: 't1', kind: 'pty', title: 'Claude', commandId: 'claude' },
    { id: 't2', kind: 'pty', title: 'Terminal' },
    { id: 't3', kind: 'file', title: 'a.ts' },
    { id: 't4', kind: 'browser', title: 'localhost' },
  ]
  const chats = [
    { id: 's1', cwd: '/p/proj/.worktrees/x', blank: false, running: true, displayTitle: 'Explore the tools' },
    { id: 's2', cwd: '/p/proj/.worktrees/x', blank: true, running: false, displayTitle: 'x' },
    { id: 's3', cwd: '/p/proj', blank: false, running: false, displayTitle: 'Greeting chat' },
    { id: 's4', blank: false, running: false, displayTitle: 'orphan' },
  ]

  it('lists every pty tile (named agent or plain terminal), never a file or browser tab', () => {
    const entries = entriesForWorktree('/p/proj/.worktrees/x', [REPO], tiles, [])
    expect(entries).toEqual([
      { kind: 'agent', id: 't1', label: 'Claude', commandId: 'claude', active: false },
      { kind: 'agent', id: 't2', label: 'Terminal', commandId: 'shell', active: false },
    ])
  })

  it('lists chat sessions whose cwd is inside the worktree, by their real displayTitle; blank ones say "New chat"', () => {
    const entries = entriesForWorktree('/p/proj/.worktrees/x', [REPO], [], chats)
    expect(entries).toEqual([
      { kind: 'chat', id: 's1', label: 'Explore the tools', running: true, active: false },
      { kind: 'chat', id: 's2', label: 'New chat', running: false, active: false, earlier: true },
    ])
  })

  it('lists open chats (a tab here, running, or selected) first and marks the rest earlier', () => {
    const history = [
      { id: 'h1', cwd: '/p/proj', blank: false, running: false, displayTitle: 'acryl' },
      { id: 'h2', cwd: '/p/proj', blank: false, running: false, displayTitle: 'acryl' },
      { id: 'tabbed', cwd: '/p/proj', blank: false, running: false, displayTitle: 'Has a tab' },
      { id: 'busy', cwd: '/p/proj', blank: false, running: true, displayTitle: 'Running' },
      { id: 'shown', cwd: '/p/proj', blank: false, running: false, displayTitle: 'Selected' },
    ]
    const chatTiles = [{ id: 'tile-1', kind: 'chat', title: 'Has a tab', chatSessionId: 'tabbed' }]
    const entries = entriesForWorktree('/p/proj', [REPO], chatTiles, history, { id: 'tile-2', chatSessionId: 'shown' })
    expect(entries.map(entry => [entry.id, entry.earlier === true])).toEqual([
      ['tabbed', false], ['busy', false], ['shown', false], ['h1', true], ['h2', true],
    ])
  })

  it('marks whichever entry matches the worktree\'s active tile (T139-followup)', () => {
    const agentActive = entriesForWorktree('/p/proj/.worktrees/x', [REPO], tiles, [], { id: 't2' })
    expect(agentActive.map(e => e.active)).toEqual([false, true])
    const chatActive = entriesForWorktree('/p/proj/.worktrees/x', [REPO], [], chats, { id: 'tile-x', chatSessionId: 's1' })
    expect(chatActive.map(e => e.active)).toEqual([true, false])
  })

  it('does not treat a nested worktree, a sibling, or a chat with no cwd as inside', () => {
    // s1/s2 belong to the nested worktree /p/proj/.worktrees/x, not its parent /p/proj (owningWorktree,
    // not a plain path-prefix check, is what keeps a linked worktree's chats from also counting for main).
    expect(entriesForWorktree('/p/proj', [REPO], [], chats).map(e => e.id)).toEqual(['s3'])
  })

  it('combines agents first, then chats, for one worktree', () => {
    const entries = entriesForWorktree('/p/proj/.worktrees/x', [REPO], tiles, chats)
    expect(entries.map(e => e.kind)).toEqual(['agent', 'agent', 'chat', 'chat'])
  })
})

describe('chatLabel', () => {
  it('prefers the durable title, even on a blank chat, then New chat while blank, then the display title', () => {
    expect(chatLabel({ blank: true, displayTitle: 'proj', title: '123' })).toBe('123')
    expect(chatLabel({ blank: true, displayTitle: 'proj' })).toBe('New chat')
    expect(chatLabel({ blank: false, displayTitle: 'Explore' })).toBe('Explore')
    expect(chatLabel({ blank: false, displayTitle: 'Explore', title: '  ' })).toBe('Explore')
  })
})

describe('reposInWorkspace (spec 043)', () => {
  const row = (path: string) => ({ path }) as never
  const repos = [
    { root: '/p/acryl', name: 'acryl', git: true, rows: [row('/p/acryl'), row('/p/acryl.worktrees/fix')] },
    { root: '/p/other', name: 'other', git: true, rows: [row('/p/other')] },
    { root: '/p/notes', name: 'notes', git: false, rows: [row('/p/notes')] },
    { root: '/p/oca', name: 'oca', git: true, rows: [row('/p/oca')] },
    { root: '/p', name: 'p', git: false, rows: [row('/p')] },
  ] as never
  it('shows only the repositories owning the workspace\'s projects (the deepest containing one, never a parent folder), not every folder a chat ran in', () => {
    expect(reposInWorkspace(repos, ['/p/acryl.worktrees/fix']).map(repo => repo.name)).toEqual(['acryl'])
    expect(reposInWorkspace(repos, ['/p/other/src', '/p/notes']).map(repo => repo.name)).toEqual(['other', 'notes'])
    expect(reposInWorkspace(repos, [])).toEqual([])
  })
  it('also shows the repository of the worktree on screen', () => {
    expect(reposInWorkspace(repos, ['/p/notes'], '/p/oca').map(repo => repo.name)).toEqual(['notes', 'oca'])
  })
})
