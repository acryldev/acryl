// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionBoardPane } from '../../src/client/board/SessionBoardPane.tsx'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

afterEach(cleanup)

const gitApi = {
  repo: async () => ({ name: 'proj', root: '/p/proj', current: '/p/proj', worktrees: [{ path: '/p/proj', branch: 'main', head: 'a', main: true }] }),
  status: async (path: string) => ({ path, branch: 'main', changes: [], truncated: false }),
} as unknown as WorkspaceGitApi

function sessionsHook(state: unknown): UseSessions {
  return ((select: (s: unknown) => unknown) => select(state)) as unknown as UseSessions
}

describe('SessionBoardPane', () => {
  it('lists chats by phase with their branch, opens one on click, and keeps local notes', async () => {
    const shell = new WorkspaceShellState(gitApi)
    await shell.discover('/p/proj')
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('kanban')
    if (tile === undefined) throw new Error('no tile')
    const open = vi.fn(() => true)
    const state = {
      ids: ['aaaaaaaa1', 'bbbbbbbb2', 'cccccccc3'],
      byId: {
        aaaaaaaa1: { running: true, blank: false, updatedAt: Date.now(), cwd: '/p/proj/src' },
        bbbbbbbb2: { running: false, blank: false, updatedAt: Date.now() - 3 * 3600_000, cwd: '/p/proj' },
        cccccccc3: { running: false, blank: true, updatedAt: Date.now() },
      },
    }
    render(<SessionBoardPane tile={tile} workspace={workspace} shell={shell} useSessions={sessionsHook(state)} navigator={{ open }} />)

    const running = document.querySelector('[data-column="running"]') as HTMLElement
    expect(within(running).getByText('main')).toBeTruthy()
    expect(within(running).getByText(/aaaaaaaa/)).toBeTruthy()
    expect(within(document.querySelector('[data-column="done"]') as HTMLElement).getByText(/3h ago/)).toBeTruthy()
    expect(within(document.querySelector('[data-column="ready"]') as HTMLElement).getByText(/cccccccc/)).toBeTruthy()

    fireEvent.click(within(running).getByRole('button'))
    expect(open).toHaveBeenCalledWith('aaaaaaaa1')

    const input = screen.getByLabelText('Add a note')
    fireEvent.change(input, { target: { value: 'remember the migration' } })
    await act(async () => { fireEvent.submit(input.closest('form') as HTMLFormElement) })
    expect(workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.board?.todo.map(c => c.text)).toEqual(['remember the migration'])
  })

  it('shows empty columns without failing when there are no chats', () => {
    const shell = new WorkspaceShellState(gitApi)
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('kanban')
    if (tile === undefined) throw new Error('no tile')
    render(<SessionBoardPane tile={tile} workspace={workspace} shell={shell} useSessions={sessionsHook({ ids: [], byId: {} })} navigator={{ open: () => false }} />)
    expect(screen.getAllByText('No chats')).toHaveLength(3)
  })
})
