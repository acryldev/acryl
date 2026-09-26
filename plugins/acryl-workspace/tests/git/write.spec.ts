import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { handleWorkspaceGitCommitRequest, handleWorkspaceGitStageRequest, handleWorkspaceGitUnstageRequest } from '../../src/git/route.ts'
import { WorkspaceGit, WorkspaceGitError } from '../../src/git/service.ts'

const IDENT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...IDENT } })
}

const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-gitw-')))
const repo = join(root, 'proj')
const noIdentity = join(root, 'anon')
const svc = new WorkspaceGit()

beforeAll(() => {
  mkdirSync(repo, { recursive: true })
  git(root, 'init', '-q', 'proj')
  git(repo, 'config', 'user.name', 't')
  git(repo, 'config', 'user.email', 't@t')
  writeFileSync(join(repo, 'a.txt'), 'a\n')
  writeFileSync(join(repo, 'b.txt'), 'b\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
})
afterAll(async () => { await svc.dispose(); rmSync(root, { recursive: true, force: true }) })

beforeEach(() => {
  git(repo, 'reset', '-q', '--hard')
  git(repo, 'clean', '-fdq')
})

const staged = (status: { changes: readonly { path: string; staged: boolean }[] }): string[] => status.changes.filter(c => c.staged).map(c => c.path).sort()

describe('stage, unstage and commit', () => {
  it('stages and unstages named files without touching the working tree, and reports the new status', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    writeFileSync(join(repo, 'new.txt'), 'n\n')
    expect(staged(await svc.stage(repo, ['a.txt', 'new.txt']))).toEqual(['a.txt', 'new.txt'])
    expect(staged(await svc.unstage(repo, ['a.txt']))).toEqual(['new.txt'])
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a2\n')
    expect(staged(await svc.unstage(repo, ['new.txt']))).toEqual([])
    expect(readFileSync(join(repo, 'new.txt'), 'utf8')).toBe('n\n')
  })

  it('commits the staged files with the message, leaves the rest, and returns the new commit', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a3\n')
    writeFileSync(join(repo, 'b.txt'), 'b3\n')
    await svc.stage(repo, ['a.txt'])
    const view = await svc.commit(repo, '  feat: change a\n\nbody line  ')
    expect(view.subject).toBe('feat: change a')
    expect(view.hash).toMatch(/^[0-9a-f]{4,}$/)
    expect(view.status.changes.map(c => [c.path, c.staged])).toEqual([['b.txt', false]])
    expect(git(repo, 'log', '-1', '--format=%B').trim()).toBe('feat: change a\n\nbody line')
  })

  it('refuses with a reason the user can act on: no message, nothing staged, unsafe paths, too many files', async () => {
    writeFileSync(join(repo, 'a.txt'), 'x\n')
    await svc.stage(repo, ['a.txt'])
    await expect(svc.commit(repo, '   ')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(svc.commit(repo, 'x'.repeat(5001))).rejects.toMatchObject({ kind: 'invalid' })
    git(repo, 'reset', '-q')
    await expect(svc.commit(repo, 'msg')).rejects.toMatchObject({ kind: 'conflict', message: 'nothing is staged to commit' })
    for (const bad of ['../outside', '/etc/passwd', '-rf', '', 'a\0b']) {
      await expect(svc.stage(repo, [bad])).rejects.toMatchObject({ kind: 'invalid' })
    }
    await expect(svc.stage(repo, [])).rejects.toMatchObject({ kind: 'invalid' })
    await expect(svc.stage(repo, Array.from({ length: 1001 }, (_v, i) => `f${String(i)}`))).rejects.toMatchObject({ kind: 'invalid' })
    await expect(svc.stage('relative', ['a.txt'])).rejects.toBeInstanceOf(WorkspaceGitError)
  })

  it('works in a repository with no commits yet', async () => {
    mkdirSync(noIdentity, { recursive: true })
    git(noIdentity, 'init', '-q')
    writeFileSync(join(noIdentity, 'f.txt'), 'f\n')
    expect(staged(await svc.stage(noIdentity, ['f.txt']))).toEqual(['f.txt'])
    expect(staged(await svc.unstage(noIdentity, ['f.txt']))).toEqual([])
  })

  it('explains a missing git identity instead of failing generically', async () => {
    const env = { ...process.env, ...IDENT, GIT_AUTHOR_NAME: '', GIT_AUTHOR_EMAIL: '', HOME: root, XDG_CONFIG_HOME: root, GIT_CONFIG_NOSYSTEM: '1' }
    execFileSync('git', ['-c', 'user.useConfigOnly=true', 'add', 'f.txt'], { cwd: noIdentity, env })
    const previous = { ...process.env }
    process.env.GIT_CONFIG_GLOBAL = '/dev/null'
    process.env.HOME = root
    try {
      const withoutIdentity = new WorkspaceGit()
      execFileSync('git', ['config', '--local', 'user.useConfigOnly', 'true'], { cwd: noIdentity, env })
      await expect(withoutIdentity.commit(noIdentity, 'first')).rejects.toMatchObject({ kind: 'conflict', message: expect.stringContaining('who you are') })
      await withoutIdentity.dispose()
    } finally {
      process.env = previous
    }
  })
})

describe('write routes', () => {
  let server: Server
  let origin: string
  let port: number
  const routeGit = new WorkspaceGit()

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = new URL(req.url ?? '', 'http://x').pathname
      const report = (): void => {}
      if (path === '/stage') void handleWorkspaceGitStageRequest(req, res, origin, routeGit, report)
      else if (path === '/unstage') void handleWorkspaceGitUnstageRequest(req, res, origin, routeGit, report)
      else void handleWorkspaceGitCommitRequest(req, res, origin, routeGit, report)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })
  afterAll(async () => { await routeGit.dispose(); await new Promise<void>(resolve => server.close(() => { resolve() })) })

  function post(path: string, body: unknown, sameOrigin = true): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const payload = typeof body === 'string' ? body : JSON.stringify(body)
      const headers: Record<string, string> = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }
      if (sameOrigin) { headers.origin = origin; headers['sec-fetch-site'] = 'same-origin' }
      const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }) })
      })
      req.on('error', reject)
      req.end(payload)
    })
  }

  it('stages, unstages and commits over POST, and refuses cross-origin, GET, malformed and refused requests', async () => {
    writeFileSync(join(repo, 'a.txt'), 'route\n')
    expect((await post('/stage', { path: repo, files: ['a.txt'] }, false)).status).toBe(403)
    const staged = await post('/stage', { path: repo, files: ['a.txt'] })
    expect(staged.status).toBe(200)
    expect((staged.body.changes as { staged: boolean }[]).some(c => c.staged)).toBe(true)
    expect((await post('/stage', { path: repo, files: 'a.txt' })).status).toBe(400)
    expect((await post('/stage', { path: repo, files: ['a.txt'], extra: 1 })).status).toBe(400)
    expect((await post('/stage', { path: repo, files: ['../x'] })).status).toBe(400)
    expect((await post('/stage', '{ nope')).status).toBe(400)
    const committed = await post('/commit', { path: repo, message: 'route commit' })
    expect(committed.status).toBe(200)
    expect(committed.body).toMatchObject({ subject: 'route commit' })
    expect((await post('/commit', { path: repo, message: 'again' })).status).toBe(409)
    expect((await post('/commit', { path: repo })).status).toBe(400)
    writeFileSync(join(repo, 'a.txt'), 'route2\n')
    await post('/stage', { path: repo, files: ['a.txt'] })
    const unstaged = await post('/unstage', { path: repo, files: ['a.txt'] })
    expect(unstaged.status).toBe(200)
    expect((unstaged.body.changes as { staged: boolean }[]).some(c => c.staged)).toBe(false)
  })
})
