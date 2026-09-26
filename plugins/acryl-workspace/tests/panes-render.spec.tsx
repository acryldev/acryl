// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesBody, splitPath, type ChangesBodyProps } from '../src/client/changes/ChangesBody.tsx'
import type { WorkspaceGitApi } from '../src/client/git/git-api.ts'
import { GitDiffPane, changeSignature, type GitDiffPaneProps } from '../src/client/diff/GitDiffPane.tsx'
import { ProjectsSidebar, type ProjectsSidebarProps } from '../src/client/projects/ProjectsSidebar.tsx'
import type { ProjectAction, ProjectsControl } from '../src/client/projects/projects-control.ts'
import { AgentsState } from '../src/client/agents/agents-state.ts'
import { WorkspaceGroups } from '../src/client/canvas/groups.ts'
import { WorkspaceShellState } from '../src/client/worktrees/shell-state.ts'
import type { WorkspaceTile } from '../src/client/canvas/state.ts'
import type { GitDiffView, GitStatusView } from '../src/git/contract.ts'

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
    async checks(path) { return { path, manager: 'pnpm', scripts: [{ name: 'check', command: 'vitest run', primary: true }, { name: 'dev', command: 'vite', primary: false }] } },
    async stage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async unstage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async search(path, query, mode) { return { path, query, mode, hits: [], truncated: false } },
    async commit(path) { return { hash: 'abc1234', subject: 'x', status: { path, branch: 'main', changes: [], truncated: false } } },
    async diff(path, file): Promise<GitDiffView> {
      return { path, file, text: DIFF_TEXT, binary: false, truncated: false }
    },
    async createWorktree(_cwd, branch) {
      const repo = { name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }, { path: `/p.worktrees/${branch}`, branch, head: 'b', main: false }] }
      return { path: `/p.worktrees/${branch}`, branch, repo }
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

function fakeProjects(overrides: Partial<ProjectsControl> = {}): ProjectsControl & { shown: string[] } {
  const shown: string[] = []
  return {
    shown,
    workspaceKey: () => '',
    workspacePaths: () => [],
    subscribeWorkspaces: () => () => {},
    addProject: async (): Promise<ProjectAction> => ({ ok: true }),
    showChat: async (path): Promise<ProjectAction> => { shown.push(path); return { ok: true } },
    newChat: async (path): Promise<ProjectAction> => { shown.push(`new:${path}`); return { ok: true } },
    newWorktree: async (root, branch): Promise<ProjectAction> => { shown.push(`worktree:${root}:${branch}`); return { ok: true } },
    openSettings: (): ProjectAction => ({ ok: true }),
    ...overrides,
  }
}

function sidebarProps(shell: WorkspaceShellState, collapsed = false, projects: ProjectsControl = fakeProjects(), groups: WorkspaceGroups = new WorkspaceGroups()): ProjectsSidebarProps {
  return {
    groups,
    agents: new AgentsState({ list: async () => [], add: async () => [], remove: async () => [] }),
    collapsed,
    width: 280,
    renderUpstream: () => <div data-testid="upstream">upstream sidebar</div>,
    useSessions: sessionsHook(SESSIONS),
    shell,
    projects,
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

  it('shows the agents open in a worktree as icons on its row, not plain terminals', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    act(() => {
      groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' })
      groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'shell', title: 'Terminal' })
    })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    const repo = await screen.findByRole('region', { name: 'proj' })
    await waitFor(() => { expect(within(repo).getByText('feature/x')).toBeTruthy() })
    const icons = repo.querySelectorAll('.dshWorkspaceWorktreeAgents [data-agent]')
    expect([...icons].map(icon => icon.getAttribute('data-agent'))).toEqual(['claude'])
    shell.dispose()
  })

  it('selects a worktree on click and follows the current session before that', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj') })

    const other = await screen.findByTitle('/p/proj-x')
    fireEvent.click(other)
    await waitFor(() => { expect(other.getAttribute('aria-pressed')).toBe('true') })
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x')
    shell.dispose()
  })

  it('shows the chat that belongs to a branch when it is picked', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByTitle('/p/proj-x'))
    await waitFor(() => { expect(projects.shown).toEqual(['/p/proj-x']) })
    shell.dispose()
  })

  it('says why a branch chat could not be opened', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects({ showChat: async () => ({ ok: false, reason: 'Could not open a chat for this branch: host down' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByTitle('/p/proj-x'))
    expect((await screen.findByRole('alert')).textContent).toContain('host down')
    shell.dispose()
  })

  it('has an Add project button that reports a refusal and clears it on the next action', async () => {
    const shell = new WorkspaceShellState(api())
    const addProject = vi.fn(async (): Promise<ProjectAction> => ({ ok: false, reason: 'That folder is not a git repository.' }))
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ addProject }))} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add git project' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not a git repository')
    expect(addProject).toHaveBeenCalledTimes(1)
    // The repo heading and the main worktree button share the path as their title; pick the button.
    await waitFor(() => { expect(screen.getAllByTitle('/p/proj').some(el => el.tagName === 'BUTTON')).toBe(true) })
    fireEvent.click(screen.getAllByTitle('/p/proj').find(el => el.tagName === 'BUTTON')!)
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    shell.dispose()
  })

  it('discovers registered workspace folders as projects even without a chat', async () => {
    const seen: string[] = []
    const shell = new WorkspaceShellState({ ...api(), repo: async (cwd) => { seen.push(cwd); return null } })
    const projects = fakeProjects({ workspacePaths: () => ['/registered/project'], workspaceKey: () => '/registered/project' })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    await waitFor(() => { expect(seen).toContain('/registered/project') })
    shell.dispose()
  })

  it('creates a new branch from the repo header form and closes it on success', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New branch in proj' }))
    const submit = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'New branch name' }), { target: { value: ' feature/login ' } })
    fireEvent.click(submit)
    await waitFor(() => { expect(projects.shown).toContain('worktree:/p/proj:feature/login') })
    await waitFor(() => { expect(screen.queryByRole('textbox', { name: 'New branch name' })).toBeNull() })
    shell.dispose()
  })

  it('keeps the form open and shows the reason when the branch cannot be created', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects({ newWorktree: async () => ({ ok: false, reason: 'the branch dup already exists' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New branch in proj' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New branch name' }), { target: { value: 'dup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect((await screen.findByRole('alert')).textContent).toContain('already exists')
    expect(screen.getByRole('textbox', { name: 'New branch name' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New branch name' }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'New branch name' })).toBeNull()
    shell.dispose()
  })

  it('starts an additional chat on a branch from its + button', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New chat on feature/x' }))
    await waitFor(() => { expect(projects.shown).toContain('new:/p/proj-x') })
    shell.dispose()
  })

  it('opens Settings from the Projects view, and says so when it cannot', async () => {
    const shell = new WorkspaceShellState(api())
    const openSettings = vi.fn((): ProjectAction => ({ ok: false, reason: 'Settings is not available in this window.' }))
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ openSettings }))} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('alert')).textContent).toContain('not available')
    shell.dispose()
  })

  it('explains an empty Projects list', async () => {
    const shell = new WorkspaceShellState(api({ repo: async () => null }))
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(await screen.findByText(/No git projects yet/)).toBeTruthy()
    shell.dispose()
  })
})

describe('ChangesBody', () => {
  const props = (shell: WorkspaceShellState): ChangesBodyProps => ({ shell, gitApi: api() }) as ChangesBodyProps

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

describe('GitDiffPane line comments', () => {
  const tile = (): WorkspaceTile => ({ id: 't1', kind: 'diff', title: 'a.ts', diffWorktree: '/p/proj', diffFile: 'src/a.ts' })
  const setup = (sendComment?: GitDiffPaneProps['sendComment']) => {
    const shell = new WorkspaceShellState(api())
    render(<GitDiffPane tile={tile()} shell={shell} gitApi={api()} {...(sendComment === undefined ? {} : { sendComment })} />)
    return shell
  }

  it('offers no comment buttons when the diff is read-only', async () => {
    const shell = setup()
    await screen.findByText('new line')
    expect(screen.queryByRole('button', { name: /Comment on/ })).toBeNull()
    shell.dispose()
  })

  it('offers a comment button per code line, but not on hunk headers', async () => {
    const shell = setup(async () => ({ ok: true }))
    await screen.findByText('new line')
    expect(screen.getByRole('button', { name: 'Comment on new line 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Comment on old line 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Comment on new line 2' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Comment on/ })).toHaveLength(3)
    shell.dispose()
  })

  it('sends the comment with the file, side, line and text, then shows it as sent', async () => {
    const send = vi.fn(async () => ({ ok: true as const }))
    const shell = setup(send)
    await screen.findByText('new line')
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 2' }))
    const box = screen.getByRole('textbox', { name: 'Comment for the agent' })
    const submit = screen.getByRole('button', { name: 'Send to agent' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(box, { target: { value: 'rename this' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => { expect(screen.getByText(/Sent to the agent: rename this/)).toBeTruthy() })
    expect(send).toHaveBeenCalledWith({
      file: 'src/a.ts', side: 'new', line: 2, kind: 'add', lineText: 'new line', comment: 'rename this',
    })
    expect(screen.queryByRole('textbox', { name: 'Comment for the agent' })).toBeNull()
    shell.dispose()
  })

  it('comments on a removed line against the old file version', async () => {
    const send = vi.fn(async () => ({ ok: true as const }))
    const shell = setup(send)
    await screen.findByText('old line')
    fireEvent.click(screen.getByRole('button', { name: 'Comment on old line 2' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment for the agent' }), { target: { value: 'why removed?' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Comment for the agent' }), { key: 'Enter', metaKey: true })
    await waitFor(() => { expect(send).toHaveBeenCalledTimes(1) })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ side: 'old', line: 2, kind: 'remove', lineText: 'old line' }))
    shell.dispose()
  })

  it('keeps the composer and shows the reason when the agent cannot take it, and Cancel closes it', async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: 'open a chat first, then send the comment' }))
    const shell = setup(send)
    await screen.findByText('new line')
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 1' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment for the agent' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to agent' }))
    expect((await screen.findByRole('alert')).textContent).toContain('open a chat first')
    expect(screen.getByRole('textbox', { name: 'Comment for the agent' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'Comment for the agent' })).toBeNull()
    shell.dispose()
  })

  it('closes the composer on Escape without sending', async () => {
    const send = vi.fn(async () => ({ ok: true as const }))
    const shell = setup(send)
    await screen.findByText('new line')
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 1' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Comment for the agent' }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Comment for the agent' })).toBeNull()
    expect(send).not.toHaveBeenCalled()
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

describe('ReviewBody', () => {
  it('lists the selected worktree comments, opens the diff, and resolves, reopens and removes them', async () => {
    const { ReviewBody } = await import('../src/client/review/ReviewBody.tsx')
    const { ReviewStore } = await import('../src/client/review/review-store.ts')
    const api: WorkspaceGitApi = {
      repo: async () => ({ root: '/p/proj', worktrees: [{ path: '/p/proj', branch: 'main', head: 'abc', isMain: true }] }),
      status: async () => STATUS,
      diff: async () => { throw new Error('unused') },
      createWorktree: async () => { throw new Error('unused') },
    } as unknown as WorkspaceGitApi
    const shell = new WorkspaceShellState(api)
    await shell.discover('/p/proj')
    shell.select('/p/proj')
    const review = new ReviewStore()
    const opened: unknown[] = []
    shell.onOpenDiff(request => { opened.push(request) })
    const props = { shell, review } as unknown as Parameters<typeof ReviewBody>[0]

    render(<ReviewBody {...props} />)
    expect(screen.getByText(/No comments yet/)).toBeTruthy()

    act(() => { review.add({ worktree: '/p/proj', file: 'src/deep/a.ts', side: 'new', line: 7, lineText: 'let x', comment: 'use const' }) })
    expect(screen.getByText('use const')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /a\.ts:7/ }))
    expect(opened).toEqual([{ worktree: '/p/proj', file: 'src/deep/a.ts' }])

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(screen.getByText(/0 open, 1 resolved/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }))
    expect(screen.getByText(/No comments yet/)).toBeTruthy()
  })
})

describe('ChecksBody', () => {
  it('lists the scripts of the selected worktree and asks the shell to run one', async () => {
    const { ChecksBody } = await import('../src/client/checks/ChecksBody.tsx')
    const shell = new WorkspaceShellState(api())
    await shell.discover('/p/proj')
    shell.select('/p/proj')
    const runs: unknown[] = []
    shell.onRunCheck(request => { runs.push(request) })
    const props = { shell, gitApi: api() } as unknown as Parameters<typeof ChecksBody>[0]

    render(<ChecksBody {...props} />)
    expect(await screen.findByText('vitest run')).toBeTruthy()
    expect(screen.getByText(/runs with pnpm/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run pnpm run check' }))
    expect(runs).toEqual([{ worktree: '/p/proj', title: 'pnpm run check', commandLine: 'pnpm run check' }])
  })

  it('shows a readable error when the scripts cannot be read', async () => {
    const { ChecksBody } = await import('../src/client/checks/ChecksBody.tsx')
    const shell = new WorkspaceShellState(api())
    await shell.discover('/p/proj')
    shell.select('/p/proj')
    const props = { shell, gitApi: api({ checks: () => Promise.reject(new Error('git checks: nope')) }) } as unknown as Parameters<typeof ChecksBody>[0]
    render(<ChecksBody {...props} />)
    expect((await screen.findByRole('alert')).textContent).toContain('nope')
  })
})
