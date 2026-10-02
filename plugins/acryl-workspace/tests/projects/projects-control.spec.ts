// @vitest-environment jsdom

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { FolderChooserUnavailableError } from '../../src/client/projects/web-folder-picker.ts'
import { createProjectsControl, desktopDirectorySeams, type DirectorySeams } from '../../src/client/projects/projects-control.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

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
    async checks(path) { return { path, manager: 'pnpm', scripts: [] } },
    async stage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async unstage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async search(path, query, mode) { return { path, query, mode, hits: [], truncated: false } },
    async commit(path) { return { hash: 'abc1234', subject: 'x', status: { path, branch: 'main', changes: [], truncated: false } } },
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
  readonly renames: { workspaceId: string; title: string }[]
  readonly workspaceDeletes: string[]
  readonly renamed: { id: string; title: string }[]
}

function world(options: {
  sessions?: { id: string; cwd?: string; blank: boolean; updatedAt: number; title?: string }[]
  workspaces?: { workspaceId: string; path: string; title?: string }[]
  /** Session ids that belong to some workspace. */
  boundSessions?: string[]
  seams?: DirectorySeams
  isRepo?: (cwd: string) => boolean
  createWorkspace?: () => Promise<unknown>
  deleteWorkspace?: () => Promise<unknown>
  renameFace?: 'missing' | 'rejects'
  webPickDirectory?: () => Promise<string | null>
  createSession?: () => Promise<string>
  hasSessions?: boolean
  platform?: 'darwin' | 'web'
} = {}): World {
  const api = gitApi(options.isRepo)
  const shell = new WorkspaceShellState(api)
  const rows = options.sessions ?? []
  const created: unknown[] = []
  const opened: string[] = []
  const workspaceCreates: { path: string }[] = []
  const renames: { workspaceId: string; title: string }[] = []
  const workspaceDeletes: string[] = []
  const renamed: { id: string; title: string }[] = []
  const items = (options.workspaces ?? []).map(w => ({ title: w.path.split('/').pop() ?? w.path, ...w, sessionIds: options.boundSessions ?? [] }))
  const sessions = {
    list: { getSnapshot: () => ({ ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])) }) },
    retain: (id: string, retainOptions: { source: string }) => {
      expect(retainOptions).toEqual({ source: 'mainView' })
      opened.push(id)
      return { release: () => {} }
    },
    scope: (id: string) => (options.renameFace === 'missing' ? undefined : { id }),
    sessionOf: (scope: { id: string }) => ({
      rename: async (title: string) => {
        if (options.renameFace === 'rejects') return { ok: false as const, error: { message: 'host down' } }
        renamed.push({ id: scope.id, title })
        return { ok: true as const, value: { title, seq: 1 } }
      },
    }),
    create: async (input: { workspaceId?: string; cwd?: string }) => {
      // The Host rejects a request that names both, so the fake does too.
      if (input.workspaceId !== undefined && input.cwd !== undefined) throw new Error('session.create accepts workspaceId or cwd, not both')
      created.push(input)
      const id = options.createSession === undefined ? 'new-session' : await options.createSession()
      rows.push({ id, blank: true, updatedAt: 0 }) // the Host lists what it just created
      return id
    },
  } as unknown as ISessions
  const workspaces = {
    list: { getSnapshot: () => ({ items }), subscribe: () => () => {} },
    rename: async (workspaceId: string, title: string) => {
      renames.push({ workspaceId, title })
      return {}
    },
    delete: async (workspaceId: string) => {
      if (options.deleteWorkspace !== undefined) await options.deleteWorkspace()
      workspaceDeletes.push(workspaceId)
    },
    create: async (input: { path: string }) => {
      workspaceCreates.push(input)
      if (options.createWorkspace !== undefined) await options.createWorkspace()
      const view = { workspaceId: `w${String(items.length)}`, path: input.path, title: input.path.split('/').pop() ?? input.path, sessionIds: [] as string[] }
      items.push(view)
      return view
    },
  } as unknown as IWorkspaces
  const control = createProjectsControl({
    platform: options.platform ?? 'darwin',
    shell,
    gitApi: api,
    getWorkspaces: () => workspaces,
    getSessions: () => (options.hasSessions === false ? undefined : sessions),
    directory: () => options.seams ?? { pickDirectory: async () => '/p/proj' },
    ...(options.webPickDirectory === undefined ? {} : { webPickDirectory: options.webPickDirectory }),
  })
  return { control, shell, created, opened, workspaceCreates, renames, workspaceDeletes, renamed }
}

describe('ProjectsControl.showChat', () => {
  it('opens the latest existing chat of the worktree', async () => {
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 3 }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.showChat('/p/proj')).toEqual({ ok: true })
    expect(w.opened).toEqual(['s1'])
    expect(w.created).toEqual([])
  })

  it('registers the worktree as its own workspace, then starts its chat there', async () => {
    // A chat opened without a workspace asks the user to choose one, and choosing the repository
    // moves it to main; so the worktree itself must be the workspace, even inside a parent's folder.
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 3 }], workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.showChat('/p/proj/.wt/x')).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj/.wt/x' }])
    expect(w.created).toEqual([{ workspaceId: 'w1' }])
    expect(w.opened).toEqual(['new-session'])
  })

  it('does not reuse an empty chat that belongs to no workspace, but does reuse a bound one', async () => {
    const unbound = world({ sessions: [{ id: 'blank-unbound', cwd: '/p/proj', blank: true, updatedAt: 9 }] })
    await unbound.shell.discover('/p/proj')
    await unbound.control.showChat('/p/proj')
    expect(unbound.opened).toEqual(['new-session'])

    const bound = world({
      sessions: [{ id: 'blank-bound', cwd: '/p/proj', blank: true, updatedAt: 9 }],
      workspaces: [{ workspaceId: 'w0', path: '/p/proj' }],
      boundSessions: ['blank-bound'],
    })
    await bound.shell.discover('/p/proj')
    await bound.control.showChat('/p/proj')
    expect(bound.opened).toEqual(['blank-bound'])
  })

  it('names a branch\'s workspace after its project, and leaves the main checkout\'s default name', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    await w.control.showChat('/p/proj/.wt/x')
    expect(w.renames).toEqual([{ workspaceId: 'w0', title: 'proj: feature/x' }])
    const main = world()
    await main.shell.discover('/p/proj')
    await main.control.showChat('/p/proj')
    expect(main.renames).toEqual([])
  })

  it('renames a branch workspace registered earlier under its bare folder name, but not one the user renamed', async () => {
    const early = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj/.wt/x' }] })
    await early.shell.discover('/p/proj')
    await early.control.showChat('/p/proj/.wt/x')
    expect(early.renames).toEqual([{ workspaceId: 'w0', title: 'proj: feature/x' }])
    expect(early.workspaceCreates).toEqual([])

    const custom = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj/.wt/x', title: 'My name' }] })
    await custom.shell.discover('/p/proj')
    await custom.control.showChat('/p/proj/.wt/x')
    expect(custom.renames).toEqual([])
  })

  it('never names both a workspace and a directory when creating a chat (the Host rejects that)', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    expect(await w.control.newChat('/p/proj')).toEqual({ ok: true })
    expect(w.created.every(input => !('cwd' in (input as object)))).toBe(true)
  })

  it('reuses a workspace whose folder is exactly the worktree instead of registering another', async () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.shell.discover('/p/proj')
    await w.control.showChat('/p/proj')
    expect(w.workspaceCreates).toEqual([])
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
  })

  it('registers a workspace for a folder that has none', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    await w.control.showChat('/p/proj')
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
  })

  it('reports a workspace that cannot be registered, without creating a chat', async () => {
    const w = world({ createWorkspace: async () => { throw new Error('read-only volume') } })
    await w.shell.discover('/p/proj')
    w.shell.select('/p/proj')
    const unpin = vi.spyOn(w.shell, 'unpin')
    expect(await w.control.showChat('/p/proj')).toMatchObject({ ok: false, reason: expect.stringContaining('read-only volume') })
    expect(w.created).toEqual([])
    expect(unpin).toHaveBeenCalled()
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
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
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
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj.worktrees/feature/login' }])
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
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

describe('ProjectsControl folder chooser', () => {
  it('names how a folder is chosen: the window picker, else the Host\'s (Web, or desktop Linux without a picker seam), else a typed path', () => {
    expect(world().control.chooserKind()).toBe('picker')
    expect(world({ seams: { pickDirectory: undefined }, webPickDirectory: async () => null }).control.chooserKind()).toBe('picker')
    expect(world({ seams: { pickDirectory: undefined } }).control.chooserKind()).toBe('path')
    expect(world({ seams: { pickDirectory: undefined }, platform: 'web' }).control.chooserKind()).toBe('path')
  })

  it('adds a typed path on Web - a git repository or a plain folder, either registers once and opens a chat', async () => {
    const w = world({ seams: { pickDirectory: undefined }, platform: 'web', isRepo: cwd => cwd === '/p/proj' })
    expect(await w.control.addProject()).toMatchObject({ ok: false, reason: expect.stringContaining('Type the path') })
    expect(await w.control.addProjectByPath('   ')).toMatchObject({ ok: false })
    // '/not/a/repo' is a real, existing, non-git directory (T134-followup) - it registers too, not refused.
    expect(await w.control.addProjectByPath('/not/a/repo')).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/not/a/repo' }])
    expect(await w.control.addProjectByPath(' /p/proj ')).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/not/a/repo' }, { path: '/p/proj' }])
  })
})

describe('ProjectsControl.addProject', () => {
  it('desktop with no window picker seam (Linux) uses the Host\'s chooser too, exactly like Web (T143/T144-followup)', async () => {
    const w = world({ seams: { pickDirectory: undefined }, webPickDirectory: async () => '/p/proj/src' })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
  })

  it('desktop with neither a window picker nor a Host chooser falls back to a typed path, like Web', async () => {
    const w = world({ seams: { pickDirectory: undefined } })
    expect(await w.control.addProject()).toMatchObject({ ok: false, reason: expect.stringContaining('Type the path'), needsPath: true })
  })

  it('does nothing when the user cancels the chooser', async () => {
    const w = world({ seams: { pickDirectory: async () => null } })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([])
  })

  it('registers a plain, non-git folder too - as its own kind of workspace, not refused (T134-followup)', async () => {
    const w = world({ isRepo: () => false, seams: { pickDirectory: async () => '/tmp/plain' } })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/tmp/plain' }])
    expect(w.shell.getSnapshot().repos.find(repo => repo.root === '/tmp/plain')).toMatchObject({ git: false })
  })

  it('registers the repository root as a workspace, selects it and opens a chat there', async () => {
    const w = world({ seams: { pickDirectory: async () => '/p/proj/src' } })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
    expect(w.shell.getSnapshot().selectedPath).toBe('/p/proj')
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
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

})

describe('ProjectsControl.removeWorkspace (T135-followup)', () => {
  it('deletes the real registration and forgets the repo from the tree', async () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.control.addProjectByPath('/p/proj')
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(true)
    expect(await w.control.removeWorkspace('/p/proj')).toEqual({ ok: true })
    expect(w.workspaceDeletes).toEqual(['w0'])
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(false)
  })

  it('still forgets the repo even when it was never a registered workspace (purely session-discovered)', async () => {
    const w = world()
    await w.shell.discover('/p/proj')
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(true)
    expect(await w.control.removeWorkspace('/p/proj')).toEqual({ ok: true })
    expect(w.workspaceDeletes).toEqual([]) // nothing to delete on the Host - there was no registration
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(false)
  })

  it('reports a real deletion failure instead of silently forgetting the repo anyway', async () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj' }], deleteWorkspace: async () => { throw new Error('host down') } })
    await w.control.addProjectByPath('/p/proj')
    expect(await w.control.removeWorkspace('/p/proj')).toMatchObject({ ok: false, reason: expect.stringContaining('host down') })
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(true) // left alone, not force-removed
  })

  it('stays removed even when a live session still points there and the passive discovery effects re-run (the real "flickers back" bug)', async () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/p/proj' }] })
    await w.control.addProjectByPath('/p/proj')
    expect(await w.control.removeWorkspace('/p/proj')).toEqual({ ok: true })
    // Simulate exactly what the two passive effects do on the very next render: mirror a session's cwd
    // (still /p/proj - removing a workspace does not delete its sessions), and re-sync the still-Host-
    // registered workspace list (the delete call already resolved above, but a real Host round trip can
    // still be a tick behind - the effect must not care either way).
    await w.shell.discover('/p/proj')
    await w.shell.discover('/p/proj', { registerFolder: true })
    expect(w.shell.getSnapshot().repos.some(repo => repo.root === '/p/proj')).toBe(false)
  })
})

describe('ProjectsControl folder chooser, remaining cases', () => {
  it('lists registered workspace folders as project sources', () => {
    const w = world({ workspaces: [{ workspaceId: 'w0', path: '/a' }, { workspaceId: 'w1', path: '/b' }] })
    expect(w.control.workspacePaths()).toEqual(['/a', '/b'])
    expect(w.control.workspaceKey()).toBe('/a\n/b')
  })
})

describe('the desktop folder chooser', () => {
  it('uses the window seams when the desktop publishes them, and offers none otherwise', async () => {
    const withSeam = desktopDirectorySeams({ __DSH_DESKTOP_PICK_DIRECTORY__: async () => '/from/seam', __DSH_DESKTOP_VALIDATE_DIRECTORY__: async () => true })
    expect(await withSeam.pickDirectory?.()).toBe('/from/seam')
    expect(await withSeam.validateDirectory?.('/x')).toBe(true)

    const without = desktopDirectorySeams({})
    expect(without.pickDirectory).toBeUndefined()
    expect(without.validateDirectory).toBeUndefined()
  })
})

describe('ProjectsControl.renameChat', () => {
  const sessions = [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 1 }]

  it('renames the session through its own face, trimming the title', async () => {
    const w = world({ sessions })
    expect(await w.control.renameChat('s1', '  Launch plan ')).toEqual({ ok: true })
    expect(w.renamed).toEqual([{ id: 's1', title: 'Launch plan' }])
  })

  it('refuses a blank name and an unknown chat, and says when the session is not ready', async () => {
    const w = world({ sessions })
    expect(await w.control.renameChat('s1', '   ')).toMatchObject({ ok: false, reason: expect.stringContaining('needs a name') })
    expect(await w.control.renameChat('nope', 'x')).toMatchObject({ ok: false, reason: expect.stringContaining('no longer available') })
    const notReady = world({ sessions, renameFace: 'missing' })
    expect(await notReady.control.renameChat('s1', 'x')).toMatchObject({ ok: false, reason: expect.stringContaining('not ready') })
    expect(w.renamed).toEqual([])
  })

  it('reports the Host refusing the rename', async () => {
    const w = world({ sessions, renameFace: 'rejects' })
    expect(await w.control.renameChat('s1', 'x')).toMatchObject({ ok: false, reason: expect.stringContaining('host down') })
  })
})

describe('ProjectsControl.openChat', () => {
  const emptyUnbound = [{ id: 'e1', cwd: '/p/proj', blank: true, updatedAt: 1, title: 'hey1' }]

  it('opens a chat that has messages as it is', async () => {
    const w = world({ sessions: [{ id: 's1', cwd: '/p/proj', blank: false, updatedAt: 1 }] })
    await w.shell.discover('/p/proj')
    expect(await w.control.openChat('s1')).toEqual({ ok: true })
    expect(w.opened).toEqual(['s1'])
    expect(w.created).toEqual([])
  })

  it('replaces an empty chat that belongs to no workspace with one bound to its worktree, keeping its name (the "Choose workspace" prompt)', async () => {
    const w = world({ sessions: emptyUnbound })
    await w.shell.discover('/p/proj')
    expect(await w.control.openChat('e1')).toEqual({ ok: true })
    // The folder was not a registered workspace at all: it is registered on demand, then the chat is bound to it.
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
    expect(w.created).toEqual([{ workspaceId: 'w0' }])
    expect(w.opened).toEqual(['new-session'])
    expect(w.renamed).toEqual([{ id: 'new-session', title: 'hey1' }])
    expect(w.shell.getSnapshot().dismissedChats.has('e1')).toBe(true)
  })

  it('leaves an empty chat alone when it already belongs to a workspace', async () => {
    const w = world({ sessions: emptyUnbound, workspaces: [{ workspaceId: 'w0', path: '/p/proj' }], boundSessions: ['e1'] })
    await w.shell.discover('/p/proj')
    expect(await w.control.openChat('e1')).toEqual({ ok: true })
    expect(w.opened).toEqual(['e1'])
    expect(w.created).toEqual([])
  })

  it('opens an empty unbound chat as it is when its folder is not a known worktree, and reports a vanished chat', async () => {
    const w = world({ sessions: [{ id: 'e2', cwd: '/elsewhere', blank: true, updatedAt: 1 }] })
    expect(await w.control.openChat('e2')).toEqual({ ok: true })
    expect(w.opened).toEqual(['e2'])
    expect(await w.control.openChat('gone')).toMatchObject({ ok: false, reason: expect.stringContaining('no longer available') })
  })

  it('says why it could not start the bound chat and keeps the empty one', async () => {
    const w = world({ sessions: emptyUnbound, createSession: async () => { throw new Error('host down') } })
    await w.shell.discover('/p/proj')
    expect(await w.control.openChat('e1')).toMatchObject({ ok: false, reason: expect.stringContaining('host down') })
    expect(w.shell.getSnapshot().dismissedChats.has('e1')).toBe(false)
  })
})

describe('ProjectsControl on Web, with the Host\'s own folder chooser', () => {
  const web = { seams: { pickDirectory: undefined }, platform: 'web' as const }

  it('uses the chooser instead of asking for a typed path, and adds what was picked', async () => {
    const w = world({ ...web, webPickDirectory: async () => '/p/proj' })
    expect(w.control.chooserKind()).toBe('picker')
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([{ path: '/p/proj' }])
  })

  it('does nothing when the chooser is cancelled', async () => {
    const w = world({ ...web, webPickDirectory: async () => null })
    expect(await w.control.addProject()).toEqual({ ok: true })
    expect(w.workspaceCreates).toEqual([])
  })

  it('falls back to a typed path when the machine has no chooser, and remembers it', async () => {
    let asked = 0
    const w = world({ ...web, webPickDirectory: async () => { asked += 1; throw new FolderChooserUnavailableError() } })
    expect(await w.control.addProject()).toMatchObject({ ok: false, needsPath: true })
    expect(w.control.chooserKind()).toBe('path')
    expect(await w.control.addProject()).toMatchObject({ ok: false, needsPath: true })
    expect(asked).toBe(1)
  })

  it('reports any other chooser failure as an ordinary error, not a request to type', async () => {
    const w = world({ ...web, webPickDirectory: async () => { throw new Error('could not be opened') } })
    const result = await w.control.addProject()
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('could not be opened') })
    expect(result).not.toHaveProperty('needsPath')
  })

  it('still asks for a typed path when the page has no chooser at all', async () => {
    const w = world(web)
    expect(w.control.chooserKind()).toBe('path')
  })
})
