import { describe, expect, it } from 'vitest'
import { buildProjectRows, owningWorktree } from '../../src/client/projects/sidebar-model.ts'
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
