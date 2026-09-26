import { describe, expect, it } from 'vitest'
import { buildSessionBoard, DONE_LIMIT, type BoardSession } from '../../src/client/board/board-model.ts'
import type { RepoState } from '../../src/client/worktrees/shell-state.ts'

const repos = [{
  root: '/p/proj',
  name: 'proj',
  worktrees: [
    { path: '/p/proj', branch: 'main', main: true, changes: [], added: 0, removed: 0, phase: 'ready' },
    { path: '/p/proj.worktrees/feat', branch: 'feat/x', main: false, changes: [], added: 0, removed: 0, phase: 'ready' },
    { path: '/p/detached', branch: null, main: false, changes: [], added: 0, removed: 0, phase: 'ready' },
  ],
}] as unknown as RepoState[]

const row = (over: Partial<BoardSession> & { id: string }): BoardSession => ({ running: false, blank: false, updatedAt: 1, ...over })

describe('buildSessionBoard', () => {
  it('puts blank chats in Ready, running ones in Running, finished ones in Done, newest first', () => {
    const board = buildSessionBoard([
      row({ id: 'a', blank: true, updatedAt: 5 }),
      row({ id: 'b', running: true, updatedAt: 3, cwd: '/p/proj.worktrees/feat/src' }),
      row({ id: 'c', updatedAt: 2, cwd: '/p/proj' }),
      row({ id: 'd', updatedAt: 9, cwd: '/p/proj' }),
      row({ id: 'e', running: true, updatedAt: 8 }),
    ], repos)
    expect(board.map(c => c.id)).toEqual(['ready', 'running', 'done'])
    expect(board[0]?.cards.map(c => c.sessionId)).toEqual(['a'])
    expect(board[1]?.cards.map(c => c.sessionId)).toEqual(['e', 'b'])
    expect(board[2]?.cards.map(c => c.sessionId)).toEqual(['d', 'c'])
  })

  it('names each chat\'s branch from its working directory, deepest worktree first, and admits an unknown folder', () => {
    const [, running, done] = buildSessionBoard([
      row({ id: 'n', running: true, cwd: '/p/proj.worktrees/feat/deep/dir' }),
      row({ id: 'm', cwd: '/p/proj/src' }),
      row({ id: 'x', cwd: '/elsewhere' }),
      row({ id: 'y' }),
      row({ id: 'z', cwd: '/p/detached' }),
    ], repos)
    expect(running?.cards[0]?.branch).toBe('feat/x')
    expect(Object.fromEntries((done?.cards ?? []).map(c => [c.sessionId, c.branch]))).toEqual({ m: 'main', x: null, y: null, z: 'detached (detached)' })
  })

  it('leaves subagent rows out and caps the Done column', () => {
    const many = Array.from({ length: DONE_LIMIT + 10 }, (_v, i) => row({ id: `s${String(i)}`, updatedAt: i }))
    const board = buildSessionBoard([...many, row({ id: 'sub', origin: 'subagent', running: true })], repos)
    expect(board[1]?.cards).toEqual([])
    expect(board[2]?.cards).toHaveLength(DONE_LIMIT)
    expect(board[2]?.cards[0]?.sessionId).toBe(`s${String(DONE_LIMIT + 9)}`)
  })

  it('is stable for no sessions', () => {
    expect(buildSessionBoard([], [])).toEqual([
      { id: 'ready', label: 'Ready', cards: [] },
      { id: 'running', label: 'Running', cards: [] },
      { id: 'done', label: 'Done', cards: [] },
    ])
  })
})
