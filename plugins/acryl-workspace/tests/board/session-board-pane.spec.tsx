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
  it('lists chats by phase with their title, branch and age, opens one on click, and keeps local notes', async () => {
    const shell = new WorkspaceShellState(gitApi)
    await shell.discover('/p/proj')
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('kanban')
    if (tile === undefined) throw new Error('no tile')
    const open = vi.fn(() => true)
    const state = {
      // DSH 0.2's session ids all start with "session-": a card that showed an id prefix showed only that.
      ids: ['session-aaaa', 'session-bbbb', 'session-cccc'],
      byId: {
        'session-aaaa': { running: true, blank: false, updatedAt: Date.now(), cwd: '/p/proj/src', displayTitle: 'Fix the login flow' },
        'session-bbbb': { running: false, blank: false, updatedAt: Date.now() - 3 * 3600_000, cwd: '/p/proj', displayTitle: 'Old chat', title: 'Renamed chat' },
        'session-cccc': { running: false, blank: true, updatedAt: Date.now(), displayTitle: '' },
      },
    }
    render(<SessionBoardPane tile={tile} workspace={workspace} shell={shell} useSessions={sessionsHook(state)} navigator={{ open }} />)

    const running = document.querySelector('[data-column="running"]') as HTMLElement
    expect(within(running).getByText('Fix the login flow')).toBeTruthy()
    expect(within(running).getByText(/^main - /)).toBeTruthy()
    const done = document.querySelector('[data-column="done"]') as HTMLElement
    expect(within(done).getByText('Renamed chat')).toBeTruthy()
    expect(within(done).getByText(/3h ago/)).toBeTruthy()
    expect(within(document.querySelector('[data-column="ready"]') as HTMLElement).getByText('New chat')).toBeTruthy()
    expect(document.body.textContent).not.toContain('session-')

    fireEvent.click(within(running).getByRole('button'))
    expect(open).toHaveBeenCalledWith('session-aaaa')

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

  it('moves a note between columns and before another note by dragging', () => {
    const shell = new WorkspaceShellState(gitApi)
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('kanban')
    if (tile === undefined) throw new Error('no tile')
    workspace.addCard(tile.id, 'todo', 'first')
    workspace.addCard(tile.id, 'todo', 'second')
    const current = () => workspace.getSnapshot().tiles.find(t => t.id === tile.id)
    const view = () => {
      const now = current()
      if (now === undefined) throw new Error('no tile')
      return <SessionBoardPane tile={now} workspace={workspace} shell={shell} useSessions={sessionsHook({ ids: [], byId: {} })} navigator={{ open: () => false }} />
    }
    const { rerender } = render(view())
    const data = new Map<string, string>()
    const dataTransfer = { types: ['application/x-acryl-note'], setData: (k: string, v: string) => { data.set(k, v) }, getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    const first = document.querySelector('[data-note]') as HTMLElement
    fireEvent.dragStart(first, { dataTransfer })
    fireEvent.drop(document.querySelector('[data-column="note-doing"]') as HTMLElement, { dataTransfer })
    expect(current()?.board?.doing.map(c => c.text)).toEqual(['first'])
    expect(current()?.board?.todo.map(c => c.text)).toEqual(['second'])

    rerender(view())
    fireEvent.dragStart(document.querySelector('[data-column="note-doing"] [data-note]') as HTMLElement, { dataTransfer })
    fireEvent.drop(document.querySelector('[data-column="note-todo"] [data-note]') as HTMLElement, { dataTransfer })
    expect(current()?.board?.todo.map(c => c.text)).toEqual(['first', 'second'])
  })
})
