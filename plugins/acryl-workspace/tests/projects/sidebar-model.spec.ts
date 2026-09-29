import { describe, expect, it } from 'vitest'
import { buildProjectRows, entriesForWorktree, owningWorktree } from '../../src/client/projects/sidebar-model.ts'
import type { RepoState, ShellSnapshot, WorktreeState } from '../../src/client/worktrees/shell-state.ts'

function worktree(path: string, branch: string | null, patch: Partial<WorktreeState> = {}): WorktreeState {
  return { path, branch, main: false, phase: 'ready', changes: [], added: 0, removed: 0, truncated: false, ...patch }
}

const REPO: RepoState = {
  root: '/p/proj',
  name: 'proj',
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
      { cwd: '/p/proj/.worktrees/x', running: true, blank: false },
      { cwd: '/p/proj/.worktrees/x', running: false, completed: true, blank: false },
      { cwd: '/p/proj', running: false, completed: true, blank: false },
      { cwd: '/p/proj', running: true, blank: true },
      { running: true, blank: false },
    ])[0]?.rows
    expect(rows?.[0]).toMatchObject({ dot: 'done', sessions: 1 })
    expect(rows?.[1]).toMatchObject({ dot: 'running', sessions: 2 })
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
      { kind: 'agent', id: 't1', label: 'Claude', commandId: 'claude' },
      { kind: 'agent', id: 't2', label: 'Terminal', commandId: 'shell' },
    ])
  })

  it('lists chat sessions whose cwd is inside the worktree, by their real displayTitle; blank ones say "New chat"', () => {
    const entries = entriesForWorktree('/p/proj/.worktrees/x', [REPO], [], chats)
    expect(entries).toEqual([
      { kind: 'chat', id: 's1', label: 'Explore the tools', running: true },
      { kind: 'chat', id: 's2', label: 'New chat', running: false },
    ])
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
