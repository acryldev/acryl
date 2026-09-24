// @vitest-environment jsdom

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceGitApi } from '../src/client/workspace/git-api.ts'
import { createProjectsControl, type DirectorySeams } from '../src/client/workspace/projects-control.ts'
import { WorkspaceShellState } from '../src/client/workspace/shell-state.ts'

function gitApi(isRepo: (cwd: string) => boolean = () => true): WorkspaceGitApi {
  return {
    async repo(cwd) {
      if (!isRepo(cwd)) return null
      return {
        name: 'proj', root: '/p/proj', current: cwd.startsWith('/p/proj/.wt') ? '/p/proj/.wt/x' : '/p/proj',
        worktrees: [
          { path: '/p/proj', branch: 'main', head: 'a', main: true },
          { path: '/p/proj/.wt/x', branch: 'feature/x', head: 'b', main: false },
        ],
      }
    },
    async status(path) {
      // Report the branch each path really has, or refreshing status would rename the listed worktrees.
      const branch = path === '/p/proj' ? 'main' : path === '/p/proj/.wt/x' || path === '/p/proj.worktrees/x' ? 'feature/x' : path.replace('/p/proj.worktrees/', '')
      return { path, branch, changes: [], truncated: false }
    },
    async diff(path, file) { return { path, file, text: '', binary: false, truncated: false } },
    async createWorktree(_cwd, branch) {
      if (branch === 'dup') throw new Error('the branch dup already exists')
      const repo = {
        name: 'proj', root: '/p/proj', current: '/p/proj',
        worktrees: [
          { path: '/p/proj', branch: 'main', head: 'a', main: true },
          { path: '/p/proj.worktrees/x', branch: 'feature/x', head: 'b', main: false },
          { path: `/p/proj.worktrees/${branch}`, branch, head: 'c', main: false },
        ],
      }
      return { path: `/p/proj.worktrees/${branch}`, branch, repo }
    },
  }
}

interface World {
  readonly control: ReturnType<typeof createProjectsControl>
  readonly shell: WorkspaceShellState
  readonly created: unknown[]
  readonly opened: string[]
  readonly workspaceCreates: { path: string }[]
}

function world(options: {
  sessions?: { id: string; cwd?: string; blank: boolean; updatedAt: number }[]
  workspaces?: { workspaceId: string; path: string }[]
  seams?: DirectorySeams
  isRepo?: (cwd: string) => boolean
  createWorkspace?: () => Promise<unknown>
  createSession?: () => Promise<string>
  hasSessions?: boolean
} = {}): World {
  const api = gitApi(options.isRepo)
  const shell = new WorkspaceShellState(api)
  const rows = options.sessions ?? []
  const created: unknown[] = []
  const opened: string[] = []
  const workspaceCreates: { path: string }[] = []
  const items = [...(options.workspaces ?? [])]
  const sessions = {
    list: { getSnapshot: () => ({ ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])) }) },
    open: (id: string) => { opened.push(id) },
    create: async (input: unknown) => {
      created.push(input)
      return options.createSession === undefined ? 'new-session' : options.createSession()
    },
  } as unknown as ISessions
  const workspaces = {
    list: { getSnapshot: () => ({ items }), subscribe: () => () => {} },
    create: async (input: { path: string }) => {
      workspaceCreates.push(input)
      if (options.createWorkspace !== undefined) await options.createWorkspace()
      items.push({ workspaceId: `w${String(items.length)}`, path: input.path })
      return {}
    },
  } as unknown as IWorkspaces
  const control = createProjectsControl({
    shell,
    gitApi: api,
    getWorkspaces: () => workspaces,
    getSessions: () => (options.hasSessions === false ? undefined : sessions),
    directory: () => options.seams ?? { pickDirectory: async () => '/p/proj' },
  })
  return { control, shell, created, opened, workspaceCreates }
}

describe('ProjectsControl.showChat', () => {
  it('opens the latest existing chat of the worktree', async () => {
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 3 }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.showChat('/p/proj')).toEqual({ ok: true })
    expect(w.opened).toEqual(['s1'])
    expect(w.created).toEqual([])
  })

  it('starts a chat in the worktree when it has none, inside the owning workspace', async () => {
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 3 }], workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.showChat('/p/proj/.wt/x')).toEqual({ ok: true })
    expect(w.created).toEqual([{ cwd: '/p/proj/.wt/x', workspaceId: 'w0' }])
    expect(w.opened).toEqual(['new-session'])
  })

  it('starts a chat without a workspace id when none owns the folder', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    await w.control.showChat('/p/proj')
    expect(w.created).toEqual([{ cwd: '/p/proj' }])
  })

  it('reports why it failed, and releases the manual pick', async () => {
    const w = world({ createSession: async () => { throw new Error('host down') } })
    await w.shell.discover('/p/proj')
    w.shell.select('/p/proj/.wt/x')
    const unpin = vi.spyOn(w.shell, 'unpin')
    const result = await w.control.showChat('/p/proj/.wt/x')
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('host down') })
    expect(unpin).toHaveBeenCalled()
    expect(await world({ hasSessions: false }).control.showChat('/p/proj')).toMatchObject({ ok: false })
  })
})

describe('ProjectsControl.newChat', () => {
  it('always starts a new chat, even when the worktree already has one', async () => {
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 3 }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.newChat('/p/proj')).toEqual({ ok: true })
    expect(w.created).toEqual([{ cwd: '/p/proj' }])
    expect(w.opened).toEqual(['new-session'])
  })
})

describe('ProjectsControl.newWorktree', () => {
  it('creates the worktree, shows it in the list, selects it and opens a new chat there', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    expect(await w.control.newWorktree('/p/proj', 'feature/login')).toEqual({ ok: true })
    const branches = w.shell.getSnapshot().repos[0]?.worktrees.map(t => t.branch)
    expect(branches).toContain('feature/login')
    expect(w.shell.getSnapshot().selectedPath).toBe('/p/proj.worktrees/feature/login')
    expect(w.created).toEqual([{ cwd: '/p/proj.worktrees/feature/login' }])
    expect(w.opened).toEqual(['new-session'])
  })

  it('returns the reason and selects nothing when creation is refused', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    expect(await w.control.newWorktree('/p/proj', 'dup')).toEqual({ ok: false, reason: 'the branch dup already exists' })
    expect(w.created).toEqual([])
    expect(w.shell.getSnapshot().selectedPath).toBeUndefined()
  })
})

describe('ProjectsControl.openSettings', () => {
  it('clicks the Settings trigger (the dialog button with no aria-label) and ignores other dialog buttons', () => {
    document.body.innerHTML = `
      <button id="market" aria-haspopup="dialog" aria-expanded="false" aria-label="Plugin Market"></button>
      <button id="settings" aria-haspopup="dialog" aria-expanded="false"></button>`
    const clicks: string[] = []
    for (const id of ['market', 'settings']) document.getElementById(id)!.addEventListener('click', () => { clicks.push(id) })
    expect(world().control.openSettings()).toEqual({ ok: true })
    expect(clicks).toEqual(['settings'])
  })

  it('reports when there is no Settings trigger', () => {
    document.body.innerHTML = ''
    expect(world().control.openSettings()).toMatchObject({ ok: false })
  })
})

describe('ProjectsControl.addProject', () => {
  it('needs the desktop folder picker', async () => {
    const w = world({ seams: { pickDirectory: undefined } })
    expect(await w.control.addProject()).toMatchObject({ ok: false, reason: expect.stringContaining('desktop') })
  })

  it('does nothing when the user cancels the chooser', async () => {
    const w = world({ seams: { pickDirectory: async () => null } })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([])
  })

  it('refuses a folder that is not a git repository and registers nothing', async () => {
    const w = world({ isRepo: () => false, seams: { pickDirectory: async () => '/tmp/plain' } })
    expect(await w.control.addProject()).toEqual({ ok: false, reason: 'That folder is not a git repository.' })
    expect(w.workspaceCreates).toEqual([])
  })

  it('registers the repository root as a workspace, selects it and opens a chat there', async () => {
    const w = world({ seams: { pickDirectory: async () => '/p/proj/src' } })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
    expect(w.shell.getSnapshot().selectedPath).toBe('/p/proj')
    expect(w.created).toEqual([{ cwd: '/p/proj', workspaceId: 'w0' }])
    expect(w.opened).toEqual(['new-session'])
  })

  it('does not register the same folder twice', async () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.control.addProject()
    expect(w.workspaceCreates).toEqual([])
  })

  it('honors the desktop path check and reports a registration failure', async () => {
    const denied = world({ seams: { pickDirectory: async () => '/p/proj', validateDirectory: async () => false } })
    expect(await denied.control.addProject()).toMatchObject({ ok: false, reason: expect.stringContaining('cannot be added') })
    expect(denied.workspaceCreates).toEqual([])

    const broken = world({ createWorkspace: async () => { throw new Error('disk full') } })
    expect(await broken.control.addProject()).toMatchObject({ ok: false, reason: expect.stringContaining('disk full') })
  })

  it('lists registered workspace folders as project sources', () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/a' }, { workspaceId: 'w1', path: '/b' }] })
    expect(w.control.workspacePaths()).toEqual(['/a', '/b'])
    expect(w.control.workspaceKey()).toBe('/a\n/b')
  })
})
