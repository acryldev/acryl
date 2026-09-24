// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesBody, splitPath, type ChangesBodyProps } from '../src/client/workspace/ChangesBody.tsx'
import type { WorkspaceGitApi } from '../src/client/workspace/git-api.ts'
import { GitDiffPane, changeSignature } from '../src/client/workspace/GitDiffPane.tsx'
import { ProjectsSidebar, type ProjectsSidebarProps } from '../src/client/workspace/ProjectsSidebar.tsx'
import { WorkspaceShellState } from '../src/client/workspace/shell-state.ts'
import type { WorkspaceTile } from '../src/client/workspace/state.ts'
import type { GitDiffView, GitStatusView } from '../src/workspace-git-contract.ts'

afterEach(cleanup)

const STATUS: GitStatusView = {
  path: '/p/proj',
  branch: 'main',
  truncated: false,
  changes: [
    { path: 'src/deep/a.ts', code: 'M', staged: true, added: 3, removed: 1 },
    { path: 'notes.md', code: '?', staged: false, added: null, removed: null },
  ],
}

const DIFF_TEXT = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,2 +1,2 @@',
  ' keep',
  '-old line',
  '+new line',
  '',
].join('\n')

function api(overrides: Partial<WorkspaceGitApi> = {}): WorkspaceGitApi {
  return {
    async repo(cwd) {
      return {
        name: 'proj',
        root: '/p/proj',
        current: cwd.startsWith('/p/proj-x') ? '/p/proj-x' : '/p/proj',
        worktrees: [
          { path: '/p/proj', branch: 'main', head: 'a', main: true },
          { path: '/p/proj-x', branch: 'feature/x', head: 'b', main: false },
        ],
      }
    },
    async status(path) { return { ...STATUS, path, branch: path === '/p/proj-x' ? 'feature/x' : 'main' } },
    async diff(path, file): Promise<GitDiffView> {
      return { path, file, text: DIFF_TEXT, binary: false, truncated: false }
    },
    ...overrides,
  }
}

/** Test seam: a `useSessions` hook over a fixed state. The real type is a generic selector hook. */
function sessionsHook(state: object): UseSessions {
  return ((selector: (value: object) => unknown) => selector(state)) as unknown as UseSessions
}

const SESSIONS = {
  ids: ['s1', 's2'],
  current: 's1',
  byId: {
    s1: { id: 's1', cwd: '/p/proj', running: true, blank: false, displayTitle: 'one', updatedAt: 1 },
    s2: { id: 's2', cwd: '/p/proj-x', running: false, blank: false, displayTitle: 'two', updatedAt: 2 },
  },
}

function sidebarProps(shell: WorkspaceShellState, collapsed = false): ProjectsSidebarProps {
  return {
    collapsed,
    width: 280,
    renderUpstream: () => <div data-testid="upstream">upstream sidebar</div>,
    useSessions: sessionsHook(SESSIONS),
    shell,
  } as ProjectsSidebarProps
}

describe('ProjectsSidebar', () => {
  it('shows the upstream sidebar in Chats mode and hides the Projects list', () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    expect(screen.getByTestId('upstream')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Chats' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('region', { name: 'proj' })).toBeNull()
    shell.dispose()
  })

  it('renders only the upstream sidebar when collapsed to the rail', () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell, true)} />)
    expect(screen.getByTestId('upstream')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    shell.dispose()
  })

  it('lists worktrees with status dots and session counts in Projects mode, keeping upstream mounted', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))

    const repo = await screen.findByRole('region', { name: 'proj' })
    await waitFor(() => { expect(within(repo).getByText('feature/x')).toBeTruthy() })
    expect(within(repo).getByText('main')).toBeTruthy()
    // s1 is running in /p/proj; s2 is idle but has changes in /p/proj-x.
    await waitFor(() => {
      expect(within(repo).getByRole('img', { name: 'Agent running' })).toBeTruthy()
      expect(within(repo).getByRole('img', { name: 'Uncommitted changes' })).toBeTruthy()
    })
    expect(screen.getByTestId('upstream')).toBeTruthy()
    shell.dispose()
  })

  it('selects a worktree on click and follows the current session before that', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj') })

    const other = await screen.findByRole('button', { name: /feature\/x/ })
    fireEvent.click(other)
    await waitFor(() => { expect(other.getAttribute('aria-pressed')).toBe('true') })
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x')
    shell.dispose()
  })

  it('explains an empty Projects list', async () => {
    const shell = new WorkspaceShellState(api({ repo: async () => null }))
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(await screen.findByText(/No git repositories yet/)).toBeTruthy()
    shell.dispose()
  })
})

describe('ChangesBody', () => {
  const props = (shell: WorkspaceShellState): ChangesBodyProps => ({ shell }) as ChangesBodyProps

  it('asks for a selection when no worktree is selected', () => {
    const shell = new WorkspaceShellState(api())
    render(<ChangesBody {...props(shell)} />)
    expect(screen.getByText(/Select a worktree/)).toBeTruthy()
    shell.dispose()
  })

  it('lists changed files with status letters, staged marker and counts, and opens a diff on click', async () => {
    const shell = new WorkspaceShellState(api())
    await shell.discover('/p/proj')
    shell.select('/p/proj')
    await act(async () => { await shell.refreshStatus('/p/proj') })
    const opened: string[] = []
    shell.onOpenDiff((request) => { opened.push(`${request.worktree}|${request.file}`) })

    render(<ChangesBody {...props(shell)} />)
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('2 changed, 1 staged')).toBeTruthy()
    const row = screen.getByTitle('src/deep/a.ts')
    expect(within(row).getByText('a.ts')).toBeTruthy()
    expect(within(row).getByTitle('Staged')).toBeTruthy()
    expect(within(row).getByText('+3')).toBeTruthy()
    expect(within(screen.getByTitle('notes.md')).getByTitle('Untracked')).toBeTruthy()

    fireEvent.click(row)
    expect(opened).toEqual(['/p/proj|src/deep/a.ts'])
    shell.dispose()
  })

  it('shows the error and the clean state', async () => {
    const failing = new WorkspaceShellState(api({ status: () => Promise.reject(new Error('git status: boom')) }))
    await failing.discover('/p/proj')
    failing.select('/p/proj')
    await act(async () => { await failing.refreshStatus('/p/proj') })
    render(<ChangesBody {...props(failing)} />)
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
    failing.dispose()
    cleanup()

    const clean = new WorkspaceShellState(api({ status: async path => ({ ...STATUS, path, changes: [] }) }))
    await clean.discover('/p/proj')
    clean.select('/p/proj')
    await act(async () => { await clean.refreshStatus('/p/proj') })
    render(<ChangesBody {...props(clean)} />)
    expect(screen.getByText('Working tree clean.')).toBeTruthy()
    clean.dispose()
  })

  it('splits a path into directory and name', () => {
    expect(splitPath('a/b/c.ts')).toEqual({ dir: 'a/b/', name: 'c.ts' })
    expect(splitPath('c.ts')).toEqual({ dir: '', name: 'c.ts' })
  })
})

describe('GitDiffPane', () => {
  const tile = (): WorkspaceTile => ({
    id: 't1',
    kind: 'diff',
    title: 'a.ts',
    diffWorktree: '/p/proj',
    diffFile: 'src/a.ts',
  })

  it('renders the unified diff with line numbers and markers, and hides file headers', async () => {
    const shell = new WorkspaceShellState(api())
    render(<GitDiffPane tile={tile()} shell={shell} gitApi={api()} />)
    const region = await screen.findByRole('region', { name: 'Diff result' })
    await waitFor(() => { expect(within(region).getByText('new line')).toBeTruthy() })
    expect(within(region).getByText('old line')).toBeTruthy()
    expect(within(region).queryByText(/diff --git/)).toBeNull()
    expect(screen.getByTitle('/p/proj/src/a.ts').textContent).toBe('src/a.ts')
    const add = within(region).getByText('new line').closest('[data-kind]')
    expect(add?.getAttribute('data-kind')).toBe('add')
    expect(add?.textContent).toContain('2')
    shell.dispose()
  })

  it('reports a binary file, an empty diff, an error, and refetches on refresh', async () => {
    const shell = new WorkspaceShellState(api())
    const diff = vi.fn(async (path: string, file: string): Promise<GitDiffView> => (
      { path, file, text: '', binary: true, truncated: false }
    ))
    const { rerender } = render(<GitDiffPane tile={tile()} shell={shell} gitApi={api({ diff })} />)
    expect(await screen.findByText(/Binary file/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh diff' }))
    await waitFor(() => { expect(diff).toHaveBeenCalledTimes(2) })

    rerender(<GitDiffPane tile={tile()} shell={shell} gitApi={api({
      diff: async (path, file) => ({ path, file, text: '', binary: false, truncated: false }),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh diff' }))
    expect(await screen.findByText('No differences against HEAD.')).toBeTruthy()

    rerender(<GitDiffPane tile={tile()} shell={shell} gitApi={api({ diff: () => Promise.reject(new Error('git diff: nope')) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh diff' }))
    expect((await screen.findByRole('alert')).textContent).toContain('nope')
    shell.dispose()
  })

  it('refetches when git reports a different state for the file', async () => {
    const shell = new WorkspaceShellState(api())
    await shell.discover('/p/proj')
    const diff = vi.fn(async (path: string, file: string): Promise<GitDiffView> => (
      { path, file, text: DIFF_TEXT, binary: false, truncated: false }
    ))
    render(<GitDiffPane tile={tile()} shell={shell} gitApi={api({ diff })} />)
    await waitFor(() => { expect(diff).toHaveBeenCalledTimes(1) })
    expect(changeSignature(shell, '/p/proj', 'src/a.ts')).toBe('none')
    await act(async () => { await shell.refreshStatus('/p/proj') })
    // The status for this worktree now lists changes, but not this file: still 'none', so no refetch.
    expect(diff).toHaveBeenCalledTimes(1)
    shell.dispose()
  })
})

describe('changeSignature', () => {
  it('is unknown for a worktree the shell has not seen', () => {
    expect(changeSignature(new WorkspaceShellState(api()), '/nope', 'a.ts')).toBe('unknown')
  })

  it('fingerprints status, staged flag and counts', async () => {
    const shell = new WorkspaceShellState(api())
    await shell.discover('/p/proj')
    await shell.refreshStatus('/p/proj')
    expect(changeSignature(shell, '/p/proj', 'src/deep/a.ts')).toBe('M:true:3:1')
    shell.dispose()
  })
})
