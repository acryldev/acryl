import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  WorkspaceGit,
  WorkspaceGitError,
  parseNumstat,
  parsePorcelain,
  parseWorktrees,
} from '../src/workspace-git.ts'
import {
  handleWorkspaceGitDiffRequest,
  handleWorkspaceGitRepoRequest,
  handleWorkspaceGitStatusRequest,
} from '../src/workspace-git-route.ts'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

// Paths are fixed at module load so `it.each` tables can name them; the repositories are created in beforeAll.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-git-')))
const main = join(root, 'proj')
const linked = join(root, 'proj-feature')
const instances: WorkspaceGit[] = []

function service(options?: ConstructorParameters<typeof WorkspaceGit>[0]): WorkspaceGit {
  const created = new WorkspaceGit(options)
  instances.push(created)
  return created
}

beforeAll(() => {
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'keep.txt'), 'one\ntwo\nthree\n')
  writeFileSync(join(main, 'gone.txt'), 'bye\n')
  writeFileSync(join(main, 'old-name.txt'), 'rename me please\nline\nline\nline\n')
  git(main, 'add', '.')
  git(main, 'commit', '-q', '-m', 'init')
  git(main, 'worktree', 'add', '-q', '-b', 'feature/x', linked)
})

afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.dispose()))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('parsers', () => {
  it('parses worktree porcelain and marks the first as main', () => {
    const text = 'worktree /a\nHEAD 111\nbranch refs/heads/main\n\nworktree /b\nHEAD 222\ndetached\n'
    expect(parseWorktrees(text)).toEqual([
      { path: '/a', head: '111', branch: 'main', main: true },
      { path: '/b', head: '222', branch: null, main: false },
    ])
  })

  it('parses numstat including a rename and a binary file', () => {
    const text = '3\t1\ta.txt\0-\t-\tb.bin\0'
      + '0\t0\t\0old.txt\0new.txt\0'
    const counts = parseNumstat(text)
    expect(counts.get('a.txt')).toEqual({ added: 3, removed: 1 })
    expect(counts.get('b.bin')).toEqual({ added: null, removed: null })
    expect(counts.get('new.txt')).toEqual({ added: 0, removed: 0 })
  })

  it('parses porcelain codes, staged flag and rename old path', () => {
    const text = ' M a.txt\0A  b.txt\0 D c.txt\0R  new.txt\0old.txt\0?? d.txt\0UU e.txt\0MM f.txt\0'
    const changes = parsePorcelain(text, new Map())
    expect(changes.map(c => [c.path, c.code, c.staged])).toEqual([
      ['a.txt', 'M', false],
      ['b.txt', 'A', true],
      ['c.txt', 'D', false],
      ['new.txt', 'R', true],
      ['d.txt', '?', false],
      ['e.txt', 'U', false],
      ['f.txt', 'M', true],
    ])
    expect(changes[3]?.oldPath).toBe('old.txt')
  })
})

describe('WorkspaceGit against a real repository', () => {
  it('lists both worktrees, the main one first, and the one containing cwd', async () => {
    const view = await service().repo(join(linked))
    expect(view).not.toBeNull()
    expect(view?.name).toBe('proj')
    expect(view?.root).toBe(main)
    expect(view?.current).toBe(linked)
    expect(view?.worktrees.map(w => [w.path, w.branch, w.main])).toEqual([
      [main, 'main', true],
      [linked, 'feature/x', false],
    ])
  })

  it('returns null for a directory that is not a repository', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain)
    expect(await service().repo(plain)).toBeNull()
  })

  it('reports modified, staged-new, deleted, renamed and untracked files with line counts', async () => {
    const dir = join(root, 'status-repo')
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'keep.txt'), 'one\ntwo\nthree\n')
    writeFileSync(join(dir, 'gone.txt'), 'bye\n')
    writeFileSync(join(dir, 'old-name.txt'), 'rename me please\nline\nline\nline\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'init')

    writeFileSync(join(dir, 'keep.txt'), 'one\nTWO\nthree\nfour\n')
    writeFileSync(join(dir, 'new.txt'), 'fresh\n')
    git(dir, 'add', 'new.txt')
    rmSync(join(dir, 'gone.txt'))
    git(dir, 'mv', 'old-name.txt', 'new-name.txt')
    writeFileSync(join(dir, 'loose.txt'), 'untracked\n')

    const status = await service().status(dir)
    expect(status.branch).toBe('main')
    expect(status.truncated).toBe(false)
    const byPath = new Map(status.changes.map(c => [c.path, c]))
    expect(byPath.get('keep.txt')).toMatchObject({ code: 'M', staged: false, added: 2, removed: 1 })
    expect(byPath.get('new.txt')).toMatchObject({ code: 'A', staged: true, added: 1, removed: 0 })
    expect(byPath.get('gone.txt')).toMatchObject({ code: 'D', added: 0, removed: 1 })
    expect(byPath.get('new-name.txt')).toMatchObject({ code: 'R', staged: true, oldPath: 'old-name.txt' })
    expect(byPath.get('loose.txt')).toMatchObject({ code: '?', added: null, removed: null })
  })

  it('caps the change list and flags truncation', async () => {
    const dir = join(root, 'cap-repo')
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    for (let i = 0; i < 5; i += 1) writeFileSync(join(dir, `f${String(i)}.txt`), 'x\n')
    const status = await service({ maxChanges: 3 }).status(dir)
    expect(status.changes).toHaveLength(3)
    expect(status.truncated).toBe(true)
  })

  it('returns a unified diff for tracked and untracked files, and flags binary', async () => {
    const dir = join(root, 'diff-repo')
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n')
    writeFileSync(join(dir, 'b.bin'), Buffer.from([0, 1, 2, 3, 0, 255]))
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'init')
    writeFileSync(join(dir, 'a.txt'), 'one\nTWO\n')
    writeFileSync(join(dir, 'b.bin'), Buffer.from([0, 9, 9, 9, 0, 255]))
    writeFileSync(join(dir, 'fresh.txt'), 'brand new\n')

    const svc = service()
    const tracked = await svc.diff(dir, 'a.txt')
    expect(tracked.binary).toBe(false)
    expect(tracked.text).toContain('-two')
    expect(tracked.text).toContain('+TWO')
    const untracked = await svc.diff(dir, 'fresh.txt')
    expect(untracked.text).toContain('+brand new')
    const binary = await svc.diff(dir, 'b.bin')
    expect(binary).toMatchObject({ binary: true, text: '' })
  })

  it('diffs in a repository that has no commits yet', async () => {
    const dir = join(root, 'empty-repo')
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'staged\n')
    git(dir, 'add', 'a.txt')
    const diff = await service().diff(dir, 'a.txt')
    expect(diff.text).toContain('+staged')
  })

  it('cuts oversized output and flags it', async () => {
    const dir = join(root, 'big-repo')
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'big.txt'), 'x\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'init')
    writeFileSync(join(dir, 'big.txt'), 'y\n'.repeat(5000))
    const diff = await service({ maxOutputBytes: 512 }).diff(dir, 'big.txt')
    expect(diff.truncated).toBe(true)
    expect(diff.text.length).toBeLessThanOrEqual(512)
  })
})

describe('request validation', () => {
  it.each([
    ['relative path', 'proj'],
    ['empty path', ''],
    ['NUL in path', `${main}\0x`],
    ['missing directory', join(root, 'nope')],
  ])('rejects %s as invalid', async (_name, path) => {
    await expect(service().status(path)).rejects.toMatchObject({ kind: 'invalid' })
  })

  it.each([
    ['parent traversal', '../secret'],
    ['nested traversal', 'a/../../secret'],
    ['absolute', '/etc/passwd'],
    ['option-looking', '--output=/tmp/x'],
    ['NUL', 'a\0b'],
    ['empty', ''],
  ])('rejects a %s file argument before running git', async (_name, file) => {
    const err = await service().diff(main, file).catch((cause: unknown) => cause)
    expect(err).toBeInstanceOf(WorkspaceGitError)
    expect((err as WorkspaceGitError).kind).toBe('invalid')
  })

  it('never writes a file named by an option-looking argument', async () => {
    const target = join(root, 'should-not-exist')
    await service().diff(main, `--output=${target}`).catch(() => undefined)
    expect(() => readFileSync(target)).toThrow()
  })
})

/** True while the process is alive. A killed process is a zombie until the OS reaps it, which is not running. */
function isRunning(pid: number): boolean {
  const state = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}

describe('disposal', () => {
  it('aborts an in-flight git process and leaves none running', async () => {
    const pidFile = join(root, 'pid')
    const script = join(root, 'slow-git.sh')
    writeFileSync(script, `#!/bin/sh\necho $$ > ${pidFile}\nexec sleep 30\n`)
    chmodSync(script, 0o755)
    const svc = new WorkspaceGit({ gitPath: script })
    const pending = svc.repo(main).catch((cause: unknown) => cause)
    let pid = 0
    // The file exists a moment before the shell writes into it; wait for a real pid (kill(0, ...) targets a group).
    for (let waited = 0; waited < 200 && pid <= 1; waited += 1) {
      try { pid = Number(readFileSync(pidFile, 'utf8').trim()) } catch { /* not created yet */ }
      if (pid <= 1) await new Promise(r => setTimeout(r, 10))
    }
    expect(pid).toBeGreaterThan(1)
    expect(isRunning(pid)).toBe(true)

    await svc.dispose()
    await pending
    expect(isRunning(pid)).toBe(false)
    await expect(svc.repo(main)).rejects.toBeInstanceOf(WorkspaceGitError)
  })
})

describe('routes', () => {
  let server: Server
  let origin: string
  let port: number
  const routeGit = new WorkspaceGit()

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = new URL(req.url ?? '', 'http://x').pathname
      const report = (): void => {}
      if (path === '/repo') void handleWorkspaceGitRepoRequest(req, res, origin, routeGit, report)
      else if (path === '/status') void handleWorkspaceGitStatusRequest(req, res, origin, routeGit, report)
      else void handleWorkspaceGitDiffRequest(req, res, origin, routeGit, report)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })

  afterAll(async () => {
    await routeGit.dispose()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
  })

  function get(path: string, sameOrigin: boolean): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = sameOrigin
        ? { origin, 'sec-fetch-site': 'same-origin' }
        : {}
      const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as unknown }) })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('refuses a request that is not same-origin', async () => {
    expect((await get(`/repo?cwd=${encodeURIComponent(main)}`, false)).status).toBe(403)
  })

  it('serves the repo view to a same-origin request', async () => {
    const { status, body } = await get(`/repo?cwd=${encodeURIComponent(main)}`, true)
    expect(status).toBe(200)
    expect(body).toMatchObject({ repo: { name: 'proj', root: main } })
  })

  it('answers 400 for a bad path, and 200 with a null repo for a directory that is not one', async () => {
    expect((await get('/status?path=relative', true)).status).toBe(400)
    expect((await get('/status', true)).status).toBe(400)
    const plain = join(root, 'plain')
    expect(await get(`/repo?cwd=${encodeURIComponent(plain)}`, true)).toEqual({ status: 200, body: { repo: null } })
  })

  it('answers 400 for a traversal file argument', async () => {
    const q = `path=${encodeURIComponent(main)}&file=${encodeURIComponent('../x')}`
    expect((await get(`/diff?${q}`, true)).status).toBe(400)
  })
})
