// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesBody, splitPath, type ChangesBodyProps } from '../src/client/changes/ChangesBody.tsx'
import type { WorkspaceGitApi } from '../src/client/git/git-api.ts'
import { GitDiffPane, changeSignature, type GitDiffPaneProps } from '../src/client/diff/GitDiffPane.tsx'
import { ProjectsSidebar, type ProjectsSidebarProps } from '../src/client/projects/ProjectsSidebar.tsx'
import type { ProjectAction, ProjectsControl } from '../src/client/projects/projects-control.ts'
import { makeStatus } from './dock/dock-fixtures.ts'
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
  byId: {
    s1: { id: 's1', cwd: '/p/proj', running: true, blank: false, displayTitle: 'one', updatedAt: 1, retainedBy: { mainView: 1 } },
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
    chooserKind: () => 'picker',
    addProject: async (): Promise<ProjectAction> => ({ ok: true }),
    addProjectByPath: async (): Promise<ProjectAction> => ({ ok: true }),
    showChat: async (path): Promise<ProjectAction> => { shown.push(path); return { ok: true } },
    newChat: async (path): Promise<ProjectAction> => { shown.push(`new:${path}`); return { ok: true } },
    openChat: async (id): Promise<ProjectAction> => { shown.push(`open:${id}`); return { ok: true } },
    newWorktree: async (root, branch): Promise<ProjectAction> => { shown.push(`worktree:${root}:${branch}`); return { ok: true } },
    removeWorkspace: async (root): Promise<ProjectAction> => { shown.push(`remove:${root}`); return { ok: true } },
    renameChat: async (id, title): Promise<ProjectAction> => { shown.push(`rename:${id}:${title}`); return { ok: true } },
    openSettings: (): ProjectAction => ({ ok: true }),
    ...overrides,
  }
}

function sidebarProps(shell: WorkspaceShellState, collapsed = false, projects: ProjectsControl = fakeProjects(), groups: WorkspaceGroups = new WorkspaceGroups()): ProjectsSidebarProps {
  return {
    groups,
    status: makeStatus().state,
    agents: new AgentsState({ list: async () => [], add: async () => [], remove: async () => [], settings: async () => { throw new Error('no settings') }, change: async () => { throw new Error('no settings') } }),
    collapsed,
    width: 280,
    renderUpstream: () => <div data-testid="upstream">upstream sidebar</div>,
    onToggleCollapse: () => {},
    useSessions: sessionsHook(SESSIONS),
    shell,
    projects,
  } as ProjectsSidebarProps
}

describe('ProjectsSidebar', () => {
  it('renders the tree, with no classic view or search toggle to switch to, and the upstream sidebar only as a host that is never display:none', () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText('Workspaces')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /classic view/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Back to Workspaces/i })).toBeNull()
    expect(screen.queryByText('All chats')).toBeNull()
    const upstream = screen.getByTestId('upstream')
    // Settings' dialog is a plain sibling of its trigger inside it: a hidden ancestor would hide the dialog too.
    expect(upstream.closest('[hidden]')).toBeNull()
    const host = upstream.closest('.dshWorkspaceUpstreamHost')
    expect(host).toBeTruthy()
    // aria-hidden (T144 follow-up, owner screenshot): this host's own real controls (its "Collapse
    // sidebar", its "Add workspace") must not appear beside the tree's own ones in anything that reads the
    // accessibility tree - acryl-agent-control's ui_snapshot found two indistinguishable "Collapse sidebar"
    // buttons without this. A click proxied through `Element.click()` (`openSettings`,
    // `clickAddWorkspaceTrigger`) still works - aria-hidden does not block programmatic clicks.
    expect(host?.getAttribute('aria-hidden')).toBe('true')
    shell.dispose()
  })

  it('renders only the upstream sidebar when collapsed to the rail', () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell, true)} />)
    expect(screen.getByTestId('upstream')).toBeTruthy()
    expect(screen.queryByText('Workspaces')).toBeNull()
    shell.dispose()
  })

  it('lists worktrees with status dots and session counts, keeping upstream mounted', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)

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

  it('collapsing a repo hides its worktrees; its own chevron, not the mode, controls that', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse proj' }))
    expect(screen.queryByText('feature/x')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand proj' }))
    expect(await screen.findByText('feature/x')).toBeTruthy()
    shell.dispose()
  })

  it('expanding a worktree lists its running agent tabs and its AcrylDSH Chats, never a file/browser/diff tab', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    act(() => {
      groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' })
      groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'shell', title: 'Terminal' })
      groups.stateFor('/p/proj-x').addTile('file', { title: 'a.ts' })
    })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    expect(await screen.findByText('Claude')).toBeTruthy()
    expect(screen.getByText('Terminal')).toBeTruthy()
    expect(screen.getByText('two')).toBeTruthy() // s2, cwd /p/proj-x, not blank - its real displayTitle
    expect(screen.queryByText('a.ts')).toBeNull() // a file tab is never listed
    shell.dispose()
  })

  it('clicking a running agent entry selects its worktree and its tab', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    let tile: { id: string } | undefined
    act(() => { tile = groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    fireEvent.click(await screen.findByText('Claude'))
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x') })
    expect(groups.stateFor('/p/proj-x').getSnapshot().activeId).toBe(tile?.id)
    shell.dispose()
  })

  it('clicking an AcrylDSH Chat entry (by its real title) selects its worktree and opens that session', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    fireEvent.click(await screen.findByText('two'))
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x') })
    expect(projects.shown).toContain('open:s2')
    shell.dispose()
  })

  it('closing a chat entry by its hover "x" hides it here and dismisses it on the shell (T134-followup)', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects())} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    await screen.findByText('two') // s2's real displayTitle
    fireEvent.click(screen.getByRole('button', { name: 'Close two' }))
    expect(shell.getSnapshot().dismissedChats.has('s2')).toBe(true)
    await waitFor(() => { expect(screen.queryByText('two')).toBeNull() })
    shell.dispose()
  })

  it('closing a chat entry with an open tab asks the canvas to close that exact tab too, not just the row (T135-followup: "removed 1, added 1, got 3")', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    // addTile('chat', ...) claims the group's existing unbound bootstrap tile rather than returning a new
    // one (see state.ts's own claim semantics) - look the real tile up afterward, not from its return value.
    act(() => { groups.stateFor('/p/proj-x').addTile('chat', { chatSessionId: 's2', title: 'two' }) })
    const tile = groups.stateFor('/p/proj-x').getSnapshot().tiles.find(candidate => candidate.chatSessionId === 's2')
    const requests: unknown[] = []
    shell.onCloseTileRequest(request => { requests.push(request) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    await screen.findByText('two')
    fireEvent.click(screen.getByRole('button', { name: 'Close two' }))
    // Routed through requestCloseTile (which itself calls shell.dismissChat once it finds the chat tile),
    // not a direct dismissChat call here - the open tab must actually close, not just the tree row.
    expect(requests).toEqual([{ worktree: '/p/proj-x', tileId: tile?.id }])
    shell.dispose()
  })

  it('highlights the row matching the tab strip\'s active tile, and follows it when the active tile changes (T139-followup: "not highlighted in the left pane list item")', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    let claude: { id: string } | undefined
    let terminal: { id: string } | undefined
    act(() => {
      claude = groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' })
      terminal = groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'shell', title: 'Terminal' })
    })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    await screen.findByText('Terminal') // added last, so it is the tile addTile leaves active
    expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Terminal' }).getAttribute('aria-pressed')).toBe('true')
    act(() => { groups.stateFor('/p/proj-x').selectTile(claude!.id) })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe('true') })
    expect(screen.getByRole('button', { name: 'Terminal' }).getAttribute('aria-pressed')).toBe('false')
    void terminal
    shell.dispose()
  })

  it('double-click renames an agent row in place, and the tab title follows (same tile title)', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    act(() => { groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Claude' }))
    fireEvent.change(screen.getByLabelText('Rename Claude'), { target: { value: 'api work' } })
    fireEvent.submit(screen.getByLabelText('Rename Claude').closest('form') as HTMLFormElement)
    expect(groups.stateFor('/p/proj-x').getSnapshot().tiles.find(t => t.commandId === 'claude')?.title).toBe('api work')
    expect(await screen.findByText('api work')).toBeTruthy()
    shell.dispose()
  })

  it('double-click renames a chat row through the session, and Escape or an unchanged name renames nothing', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'two' }))
    fireEvent.change(screen.getByLabelText('Rename two'), { target: { value: 'launch plan' } })
    fireEvent.keyDown(screen.getByLabelText('Rename two'), { key: 'Escape' })
    expect(projects.shown.some(entry => entry.startsWith('rename:'))).toBe(false)

    fireEvent.doubleClick(await screen.findByRole('button', { name: 'two' }))
    fireEvent.blur(screen.getByLabelText('Rename two')) // unchanged
    expect(projects.shown.some(entry => entry.startsWith('rename:'))).toBe(false)

    fireEvent.doubleClick(await screen.findByRole('button', { name: 'two' }))
    fireEvent.change(screen.getByLabelText('Rename two'), { target: { value: 'launch plan' } })
    fireEvent.submit(screen.getByLabelText('Rename two').closest('form') as HTMLFormElement)
    await waitFor(() => { expect(projects.shown).toContain('rename:s2:launch plan') })
    shell.dispose()
  })

  it('shows why a chat could not be renamed', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects({ renameChat: async () => ({ ok: false, reason: 'Could not rename that chat: host down' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'two' }))
    fireEvent.change(screen.getByLabelText('Rename two'), { target: { value: 'x2' } })
    fireEvent.submit(screen.getByLabelText('Rename two').closest('form') as HTMLFormElement)
    expect((await screen.findByRole('alert')).textContent).toContain('host down')
    shell.dispose()
  })

  it('closing an agent entry by its hover "x" asks the canvas to close that exact tile (T134-followup)', async () => {
    const shell = new WorkspaceShellState(api())
    const groups = new WorkspaceGroups()
    let tile: { id: string } | undefined
    act(() => { tile = groups.stateFor('/p/proj-x').addTile('pty', { commandId: 'claude', title: 'Claude' }) })
    const requests: unknown[] = []
    shell.onCloseTileRequest(request => { requests.push(request) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects(), groups)} />)
    await screen.findByText('feature/x')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on feature/x' }))
    await screen.findByText('Claude')
    fireEvent.click(screen.getByRole('button', { name: 'Close Claude' }))
    expect(requests).toEqual([{ worktree: '/p/proj-x', tileId: tile?.id }])
    shell.dispose()
  })

  it('says nothing is running when an expanded worktree has no agent tabs or chats', async () => {
    const shell = new WorkspaceShellState(api())
    // The one session here belongs to /p/proj-x, not /p/proj (main) - discovers the same repo via api()'s
    // cwd-agnostic mock, but leaves main with no chats and no agent tiles.
    const noSessions = { ids: ['s1'], byId: { s1: { id: 's1', cwd: '/p/proj-x', running: false, blank: true, displayTitle: '', updatedAt: 1, retainedBy: {} } } }
    render(<ProjectsSidebar {...sidebarProps(shell)} useSessions={sessionsHook(noSessions)} />)
    await screen.findByText('main')
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions on main' }))
    expect(await screen.findByText('Nothing running here yet.')).toBeTruthy()
    shell.dispose()
  })

  it('on Web, + opens a path form and adds what was typed', async () => {
    const shell = new WorkspaceShellState(api())
    const addProjectByPath = vi.fn(async (): Promise<ProjectAction> => ({ ok: true }))
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ chooserKind: () => 'path', addProjectByPath }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add git project' }))
    fireEvent.change(screen.getByLabelText('Project folder path'), { target: { value: '/p/proj' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => { expect(addProjectByPath).toHaveBeenCalledWith('/p/proj') })
    await waitFor(() => { expect(screen.queryByLabelText('Project folder path')).toBeNull() })
    shell.dispose()
  })

  it('shows why a typed path was refused and keeps the form open', async () => {
    const shell = new WorkspaceShellState(api())
    const addProjectByPath = async (): Promise<ProjectAction> => ({ ok: false, reason: 'That folder is not a git repository.' })
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ chooserKind: () => 'path', addProjectByPath }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add git project' }))
    fireEvent.change(screen.getByLabelText('Project folder path'), { target: { value: '/nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not a git repository')
    expect(screen.getByLabelText('Project folder path')).toBeTruthy()
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
    const repo = await screen.findByRole('region', { name: 'proj' })
    await waitFor(() => { expect(within(repo).getByText('feature/x')).toBeTruthy() })
    const icons = repo.querySelectorAll('.dshWorkspaceWorktreeAgents [data-agent]')
    expect([...icons].map(icon => icon.getAttribute('data-agent'))).toEqual(['claude'])
    shell.dispose()
  })

  it('selects a worktree on click and follows the current session before that', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj') })

    const other = await screen.findByTitle('/p/proj-x')
    fireEvent.click(other)
    await waitFor(() => { expect(other.getAttribute('aria-pressed')).toBe('true') })
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x')
    shell.dispose()
  })

  it('expanding a worktree\'s session list also selects it, so the tab strip shows everything immediately (T137-followup: "only appear when I click each of them individually")', async () => {
    const shell = new WorkspaceShellState(api())
    render(<ProjectsSidebar {...sidebarProps(shell)} />)
    await waitFor(() => { expect(shell.getSnapshot().selectedPath).toBe('/p/proj') })
    fireEvent.click(await screen.findByRole('button', { name: 'Show sessions on feature/x' }))
    // Expanding feature/x's row list, without ever clicking the worktree's own name/button, still
    // switches the active worktree - not just revealing rows while leaving /p/proj selected underneath.
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x')
    shell.dispose()
  })

  it('calls onToggleCollapse from the tree\'s own header control (T137-followup: "there used to be icon to collapse sidebar... it\'s gone")', async () => {
    const shell = new WorkspaceShellState(api())
    const onToggleCollapse = vi.fn()
    render(<ProjectsSidebar {...sidebarProps(shell)} onToggleCollapse={onToggleCollapse} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggleCollapse).toHaveBeenCalledOnce()
    shell.dispose()
  })

  it('shows the chat that belongs to a branch when it is picked', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(await screen.findByTitle('/p/proj-x'))
    await waitFor(() => { expect(projects.shown).toEqual(['/p/proj-x']) })
    shell.dispose()
  })

  it('says why a branch chat could not be opened', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects({ showChat: async () => ({ ok: false, reason: 'Could not open a chat for this branch: host down' }) })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(await screen.findByTitle('/p/proj-x'))
    expect((await screen.findByRole('alert')).textContent).toContain('host down')
    shell.dispose()
  })

  it('has an Add project button that reports a refusal and clears it on the next action', async () => {
    const shell = new WorkspaceShellState(api())
    const addProject = vi.fn(async (): Promise<ProjectAction> => ({ ok: false, reason: 'That folder is not a git repository.' }))
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ addProject }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add git project' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not a git repository')
    expect(addProject).toHaveBeenCalledTimes(1)
    // The repo heading and the main worktree button share the path as their title; pick the button.
    await waitFor(() => { expect(screen.getAllByTitle('/p/proj').some(el => el.tagName === 'BUTTON')).toBe(true) })
    fireEvent.click(screen.getAllByTitle('/p/proj').find(el => el.tagName === 'BUTTON')!)
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    shell.dispose()
  })

  it('discovers registered workspace folders as projects even without a chat, and registers a non-git one too (T135)', async () => {
    const seen: string[] = []
    const shell = new WorkspaceShellState({ ...api(), repo: async (cwd) => { seen.push(cwd); return null } })
    const projects = fakeProjects({ workspacePaths: () => ['/registered/project'], workspaceKey: () => '/registered/project' })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    await waitFor(() => { expect(seen).toContain('/registered/project') })
    // Explicitly registered, so a non-git answer still becomes its own workspace entry, not silently dropped.
    expect(await screen.findByRole('region', { name: 'project' })).toBeTruthy()
    shell.dispose()
  })

  it('never turns a mere chat session cwd into a permanent workspace when it is not a git repository (T135: "web suddenly shows so many workspaces - didn\'t open them")', async () => {
    const seen: string[] = []
    const shell = new WorkspaceShellState({ ...api(), repo: async (cwd) => { seen.push(cwd); return null } })
    const untouched = { ids: ['s1'], byId: { s1: { id: 's1', cwd: '/tmp/scratch-dir', running: false, blank: false, displayTitle: 'x', updatedAt: 1, retainedBy: {} } } }
    render(<ProjectsSidebar {...sidebarProps(shell)} useSessions={sessionsHook(untouched)} />)
    await waitFor(() => { expect(seen).toContain('/tmp/scratch-dir') })
    expect(screen.queryByRole('region', { name: 'scratch-dir' })).toBeNull()
    shell.dispose()
  })

  it('removes a workspace from the repo header\'s own "x" (T135-followup)', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove proj' }))
    await waitFor(() => { expect(projects.shown).toContain('remove:/p/proj') })
    shell.dispose()
  })

  it('opens the typed-path form, with the reason, when the chooser says the machine has none', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects({
      chooserKind: () => 'picker',
      addProject: async (): Promise<ProjectAction> => ({ ok: false, reason: 'This machine has no folder chooser - type the folder path instead.', needsPath: true }),
    })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add git project' }))
    expect(await screen.findByLabelText('Project folder path')).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toContain('no folder chooser')
    expect(screen.queryByRole('alert')).toBeNull()
    shell.dispose()
  })

  it('creates a new branch from the repo header form and closes it on success', async () => {
    const shell = new WorkspaceShellState(api())
    const projects = fakeProjects()
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} />)
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
    fireEvent.click(await screen.findByRole('button', { name: 'New chat on feature/x' }))
    await waitFor(() => { expect(projects.shown).toContain('new:/p/proj-x') })
    shell.dispose()
  })

  it('opens Settings, and says so when it cannot', async () => {
    const shell = new WorkspaceShellState(api())
    const openSettings = vi.fn((): ProjectAction => ({ ok: false, reason: 'Settings is not available in this window.' }))
    render(<ProjectsSidebar {...sidebarProps(shell, false, fakeProjects({ openSettings }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('alert')).textContent).toContain('not available')
    shell.dispose()
  })

  it('explains an empty projects list', async () => {
    const shell = new WorkspaceShellState(api({ repo: async () => null }))
    const noSessions = { ids: [], byId: {} }
    render(<ProjectsSidebar {...sidebarProps(shell)} useSessions={sessionsHook(noSessions)} />)
    expect(await screen.findByText(/No workspaces yet/)).toBeTruthy()
    shell.dispose()
  })

  it('registers a non-git folder as its own kind of workspace instead of refusing it (T134-followup)', async () => {
    const shell = new WorkspaceShellState(api({ repo: async () => null }))
    const noSessions = { ids: [], byId: {} }
    const projects = fakeProjects({ workspacePaths: () => ['/p/plain-folder'], workspaceKey: () => '/p/plain-folder' })
    render(<ProjectsSidebar {...sidebarProps(shell, false, projects)} useSessions={sessionsHook(noSessions)} />)
    expect(await screen.findByRole('region', { name: 'plain-folder' })).toBeTruthy()
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
