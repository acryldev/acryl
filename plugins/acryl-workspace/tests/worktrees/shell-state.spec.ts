import { describe, expect, it } from 'vitest'
import type { GitRepoView, GitStatusView } from '../../src/git/contract.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

const REPO: GitRepoView = {
  name: 'proj',
  root: '/p/proj',
  current: '/p/proj',
  worktrees: [
    { path: '/p/proj', branch: 'main', head: 'a', main: true },
    { path: '/p/proj-x', branch: 'feature/x', head: 'b', main: false },
  ],
}

function fakeApi(overrides: Partial<WorkspaceGitApi> = {}): WorkspaceGitApi & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async repo(cwd) {
      calls.push(`repo ${cwd}`)
      if (cwd.startsWith('/plain')) return null
      return { ...REPO, current: cwd.startsWith('/p/proj-x') ? '/p/proj-x' : '/p/proj' }
    },
    async status(path): Promise<GitStatusView> {
      calls.push(`status ${path}`)
      return {
        path,
        branch: path === '/p/proj-x' ? 'feature/x' : 'main',
        truncated: false,
        changes: [
          { path: 'a.ts', code: 'M', staged: false, added: 3, removed: 1 },
          { path: 'b.ts', code: '?', staged: false, added: null, removed: null },
        ],
      }
    },
    async checks(path) { return { path, manager: 'pnpm', scripts: [] } },
    async stage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async unstage(path) { return { path, branch: 'main', changes: [], truncated: false } },
    async search(path, query, mode) { return { path, query, mode, hits: [], truncated: false } },
    async commit(path) { return { hash: 'abc1234', subject: 'x', status: { path, branch: 'main', changes: [], truncated: false } } },
    async diff(path, file) {
      return { path, file, text: '', binary: false, truncated: false }
    },
    async createWorktree(_cwd, branch) {
      const repo = { name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }, { path: `/p.worktrees/${branch}`, branch, head: 'b', main: false }] }
      return { path: `/p.worktrees/${branch}`, branch, repo }
    },
    ...overrides,
  }
}

describe('WorkspaceShellState', () => {
  it('discovers a repository once per directory and lists its worktrees', async () => {
    const api = fakeApi()
    const shell = new WorkspaceShellState(api)
    await Promise.all([shell.discover('/p/proj'), shell.discover('/p/proj')])
    expect(api.calls.filter(call => call.startsWith('repo'))).toHaveLength(1)
    const [repo] = shell.getSnapshot().repos
    expect(repo?.name).toBe('proj')
    expect(repo?.worktrees.map(w => w.branch)).toEqual(['main', 'feature/x'])
  })

  it('ignores a directory that is not a repository', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    expect(await shell.discover('/plain/dir')).toBeUndefined()
    expect(shell.getSnapshot().repos).toEqual([])
  })

  it('deduplicates two directories in the same repository into one repo', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    await shell.discover('/p/proj')
    await shell.discover('/p/proj-x')
    expect(shell.getSnapshot().repos).toHaveLength(1)
  })

  it('follows the session worktree until the user picks one by hand', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    await shell.follow('/p/proj')
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj')
    await shell.follow('/p/proj-x')
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj-x')

    shell.select('/p/proj')
    await shell.follow('/p/proj-x')
    expect(shell.getSnapshot().selectedPath).toBe('/p/proj')
  })

  it('loads status on selection and sums line counts, treating null as zero', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    await shell.discover('/p/proj')
    shell.select('/p/proj-x')
    await shell.refreshStatus('/p/proj-x')
    const worktree = shell.selectedWorktree()
    expect(worktree).toMatchObject({ phase: 'ready', added: 3, removed: 1, branch: 'feature/x' })
    expect(worktree?.changes).toHaveLength(2)
  })

  it('coalesces concurrent status requests for one path', async () => {
    const api = fakeApi()
    const shell = new WorkspaceShellState(api)
    await shell.discover('/p/proj')
    await Promise.all([shell.refreshStatus('/p/proj'), shell.refreshStatus('/p/proj')])
    expect(api.calls.filter(call => call === 'status /p/proj')).toHaveLength(1)
  })

  it('records an error phase when status fails and recovers on the next success', async () => {
    let fail = true
    const base = fakeApi()
    const shell = new WorkspaceShellState({
      ...base,
      status: (path) => fail ? Promise.reject(new Error('git status: boom')) : base.status(path),
    })
    await shell.discover('/p/proj')
    await shell.refreshStatus('/p/proj')
    expect(shell.selectedWorktree()).toBeUndefined()
    const before = shell.getSnapshot().repos[0]?.worktrees[0]
    expect(before).toMatchObject({ phase: 'error', error: 'git status: boom' })
    fail = false
    await shell.refreshStatus('/p/proj')
    expect(shell.getSnapshot().repos[0]?.worktrees[0]).toMatchObject({ phase: 'ready' })
  })

  it('drops a removed worktree and clears a selection that pointed at it', async () => {
    let listed = REPO
    const shell = new WorkspaceShellState(fakeApi({ repo: async () => listed }))
    await shell.discover('/p/proj')
    shell.select('/p/proj-x')
    listed = { ...REPO, worktrees: [REPO.worktrees[0]!] }
    await shell.refreshAll()
    expect(shell.getSnapshot().repos[0]?.worktrees).toHaveLength(1)
    expect(shell.getSnapshot().selectedPath).toBeUndefined()
  })

  it('notifies subscribers, stops after unsubscribe, and ignores results after dispose', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    let count = 0
    const off = shell.subscribe(() => { count += 1 })
    shell.setMode('projects')
    expect(count).toBe(1)
    shell.setMode('projects')
    expect(count).toBe(1)
    off()
    shell.setMode('chats')
    expect(count).toBe(1)

    const pending = shell.discover('/p/proj')
    shell.dispose()
    await pending
    expect(shell.getSnapshot().repos).toEqual([])
  })

  it('forwards an open-diff request to listeners until they unsubscribe', () => {
    const shell = new WorkspaceShellState(fakeApi())
    const seen: string[] = []
    const off = shell.onOpenDiff(request => { seen.push(`${request.worktree}:${request.file}`) })
    shell.openDiff({ worktree: '/p/proj', file: 'a.ts' })
    off()
    shell.openDiff({ worktree: '/p/proj', file: 'b.ts' })
    expect(seen).toEqual(['/p/proj:a.ts'])
  })
})

describe('WorkspaceShellState notifications', () => {
  it('does not notify when a poll returns exactly what is already known', async () => {
    const shell = new WorkspaceShellState(fakeApi())
    await shell.discover('/p/proj')
    await shell.refreshAll()
    let notified = 0
    shell.subscribe(() => { notified += 1 })
    await shell.refreshAll()
    await shell.refreshAll()
    expect(notified).toBe(0)
  })

  it('notifies when a file changes, and again only when it changes back', async () => {
    let added = 3
    const base = fakeApi()
    const shell = new WorkspaceShellState({
      ...base,
      status: async (path) => ({
        path, branch: path === '/p/proj-x' ? 'feature/x' : 'main', truncated: false,
        changes: [{ path: 'a.ts', code: 'M', staged: false, added, removed: 1 }],
      }),
    })
    await shell.discover('/p/proj')
    await shell.refreshAll()
    let notified = 0
    shell.subscribe(() => { notified += 1 })
    await shell.refreshAll()
    expect(notified).toBe(0)
    added = 4
    await shell.refreshAll()
    expect(notified).toBeGreaterThan(0)
    expect(shell.getSnapshot().repos[0]?.worktrees[0]?.added).toBe(4)
  })
})

describe('run-check channel', () => {
  it('delivers a run request to listeners until they unsubscribe or the shell is disposed', () => {
    const shell = new WorkspaceShellState(fakeApi())
    const seen: unknown[] = []
    const off = shell.onRunCheck(request => { seen.push(request) })
    const request = { worktree: '/p/proj', title: 'pnpm run check', commandLine: 'pnpm run check' }
    shell.runCheck(request)
    expect(seen).toEqual([request])
    off()
    shell.runCheck(request)
    expect(seen).toHaveLength(1)
    shell.onRunCheck(r => { seen.push(r) })
    shell.dispose()
    shell.runCheck(request)
    expect(seen).toHaveLength(1)
  })
})

describe('open-file channel', () => {
  it('delivers an open request to listeners until they unsubscribe or the shell is disposed', () => {
    const shell = new WorkspaceShellState(fakeApi())
    const seen: unknown[] = []
    const off = shell.onOpenFile(request => { seen.push(request) })
    shell.openFile({ worktree: '/p/proj', file: 'src/a.ts' })
    expect(seen).toEqual([{ worktree: '/p/proj', file: 'src/a.ts' }])
    off()
    shell.openFile({ worktree: '/p/proj', file: 'b.ts' })
    expect(seen).toHaveLength(1)
    shell.onOpenFile(r => { seen.push(r) })
    shell.dispose()
    shell.openFile({ worktree: '/p/proj', file: 'c.ts' })
    expect(seen).toHaveLength(1)
  })
})

describe('open-doc channel', () => {
  it('delivers a preview request to listeners until they unsubscribe or the shell is disposed', () => {
    const shell = new WorkspaceShellState(fakeApi())
    const seen: unknown[] = []
    const off = shell.onOpenDoc(request => { seen.push(request) })
    shell.openDoc({ worktree: '/p/proj', file: 'README.md' })
    expect(seen).toEqual([{ worktree: '/p/proj', file: 'README.md' }])
    off()
    shell.openDoc({ worktree: '/p/proj', file: 'b.md' })
    expect(seen).toHaveLength(1)
    shell.onOpenDoc(r => { seen.push(r) })
    shell.dispose()
    shell.openDoc({ worktree: '/p/proj', file: 'c.md' })
    expect(seen).toHaveLength(1)
  })
})

