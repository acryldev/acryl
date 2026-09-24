import { describe, expect, it } from 'vitest'
import type { GitRepoView, GitStatusView } from '../src/workspace-git-contract.ts'
import type { WorkspaceGitApi } from '../src/client/workspace/git-api.ts'
import { WorkspaceShellState } from '../src/client/workspace/shell-state.ts'

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
    async diff(path, file) {
      return { path, file, text: '', binary: false, truncated: false }
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
