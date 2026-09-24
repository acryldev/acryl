import { describe, expect, it } from 'vitest'
import { pickSession } from '../src/client/workspace/session-pick.ts'
import type { RepoState, WorktreeState } from '../src/client/workspace/shell-state.ts'

const wt = (path: string, main = false): WorktreeState => (
  { path, branch: path, main, phase: 'ready', changes: [], added: 0, removed: 0, truncated: false }
)
const REPOS: RepoState[] = [{ root: '/p', name: 'p', worktrees: [wt('/p', true), wt('/p/.worktrees/x'), wt('/q')] }]

describe('pickSession', () => {
  it('returns undefined when the worktree has no chat', () => {
    expect(pickSession(REPOS, [{ id: 'a', cwd: '/q', blank: false, updatedAt: 1 }], '/p')).toBeUndefined()
    expect(pickSession(REPOS, [], '/p')).toBeUndefined()
  })

  it('prefers the most recently updated chat that has messages', () => {
    const sessions = [
      { id: 'old', cwd: '/p', blank: false, updatedAt: 1 },
      { id: 'new', cwd: '/p/src', blank: false, updatedAt: 9 },
      { id: 'elsewhere', cwd: '/q', blank: false, updatedAt: 99 },
    ]
    expect(pickSession(REPOS, sessions, '/p')).toBe('new')
  })

  it('reuses an empty chat only when there is no chat with messages', () => {
    const empty = { id: 'empty', cwd: '/p', blank: true, updatedAt: 50 }
    expect(pickSession(REPOS, [empty], '/p')).toBe('empty')
    expect(pickSession(REPOS, [empty, { id: 'real', cwd: '/p', blank: false, updatedAt: 1 }], '/p')).toBe('real')
  })

  it('gives a nested linked worktree its own chats, not the main checkout\'s', () => {
    const sessions = [
      { id: 'main-chat', cwd: '/p', blank: false, updatedAt: 5 },
      { id: 'x-chat', cwd: '/p/.worktrees/x/src', blank: false, updatedAt: 1 },
    ]
    expect(pickSession(REPOS, sessions, '/p/.worktrees/x')).toBe('x-chat')
    expect(pickSession(REPOS, sessions, '/p')).toBe('main-chat')
  })

  it('ignores a chat with no directory', () => {
    expect(pickSession(REPOS, [{ id: 'a', blank: false, updatedAt: 1 }], '/p')).toBeUndefined()
  })
})
