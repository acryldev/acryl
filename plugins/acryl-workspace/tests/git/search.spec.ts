import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleWorkspaceGitSearchRequest } from '../../src/git/route.ts'
import { WorkspaceGit } from '../../src/git/service.ts'
import { MAX_SEARCH_RESULTS } from '../../src/git/contract.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-search-')))
const repo = join(root, 'proj')
const svc = new WorkspaceGit()

function git(...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
}

beforeAll(() => {
  mkdirSync(join(repo, 'src', 'deep'), { recursive: true })
  mkdirSync(join(repo, 'node_modules', 'dep'), { recursive: true })
  execFileSync('git', ['init', '-q', repo])
  writeFileSync(join(repo, '.gitignore'), 'node_modules\nsecret.log\n')
  writeFileSync(join(repo, 'src', 'widget.ts'), 'export const Widget = 1\nfunction render() {}\n')
  writeFileSync(join(repo, 'src', 'deep', 'other.ts'), 'const w = "widget in a string"\n')
  writeFileSync(join(repo, 'README.md'), 'A [regex.*] (tricky) -x query\n')
  writeFileSync(join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 119, 105, 100, 103, 101, 116]))
  writeFileSync(join(repo, 'node_modules', 'dep', 'widget.js'), 'widget\n')
  writeFileSync(join(repo, 'secret.log'), 'widget secret\n')
  git('add', '.gitignore', 'src', 'README.md', 'blob.bin')
  git('commit', '-q', '-m', 'init')
  writeFileSync(join(repo, 'untracked-widget.txt'), 'widget untracked\n')
  writeFileSync(join(repo, 'many.txt'), Array.from({ length: MAX_SEARCH_RESULTS + 20 }, () => 'needle line').join('\n') + '\n')
})
afterAll(async () => { await svc.dispose(); rmSync(root, { recursive: true, force: true }) })

describe('search', () => {
  it('finds files by name case-insensitively, own-name matches first, tracked and untracked, never ignored ones', async () => {
    const view = await svc.search(repo, 'WIDGET', 'name')
    expect(view.hits.map(h => h.file)).toEqual(['src/widget.ts', 'untracked-widget.txt'])
    expect(view.truncated).toBe(false)
    expect((await svc.search(repo, 'deep', 'name')).hits.map(h => h.file)).toEqual(['src/deep/other.ts'])
    expect((await svc.search(repo, 'zzznothing', 'name')).hits).toEqual([])
  })

  it('finds lines by content with file, line number and text, skipping binary and ignored files', async () => {
    const view = await svc.search(repo, 'widget', 'content')
    const found = view.hits.map(h => `${h.file}:${String(h.line)}`).sort()
    expect(found).toEqual(['src/deep/other.ts:1', 'src/widget.ts:1', 'untracked-widget.txt:1'])
    expect(view.hits.find(h => h.file === 'src/widget.ts')?.text).toBe('export const Widget = 1')
  })

  it('treats the query literally: regex characters and a leading dash are just text', async () => {
    expect((await svc.search(repo, '[regex.*]', 'content')).hits.map(h => h.file)).toEqual(['README.md'])
    expect((await svc.search(repo, '-x query', 'content')).hits.map(h => h.file)).toEqual(['README.md'])
    expect((await svc.search(repo, '.*', 'content')).hits).toEqual([{ file: 'README.md', line: 1, text: 'A [regex.*] (tricky) -x query' }])
  })

  it('caps the number of hits and says so', async () => {
    const view = await svc.search(repo, 'needle', 'content')
    expect(view.hits).toHaveLength(MAX_SEARCH_RESULTS)
    expect(view.truncated).toBe(true)
  })

  it('refuses an empty, oversized or NUL query and an unknown mode', async () => {
    for (const bad of ['', '   ', 'x'.repeat(201), 'a\0b']) await expect(svc.search(repo, bad, 'name')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(svc.search(repo, 'x', 'regex' as 'name')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(svc.search('relative', 'x', 'name')).rejects.toMatchObject({ kind: 'invalid' })
  })
})

describe('search route', () => {
  let server: Server
  let origin: string
  let port: number
  const routeGit = new WorkspaceGit()
  beforeAll(async () => {
    server = createServer((req, res) => { void handleWorkspaceGitSearchRequest(req, res, origin, routeGit, () => {}) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })
  afterAll(async () => { await routeGit.dispose(); await new Promise<void>(resolve => server.close(() => { resolve() })) })

  function get(path: string, sameOrigin: boolean): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = sameOrigin ? { origin, 'sec-fetch-site': 'same-origin' } : {}
      const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }) })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('serves a search to a same-origin request and refuses the rest', async () => {
    const q = `path=${encodeURIComponent(repo)}&q=widget&mode=name`
    expect((await get(`/?${q}`, false)).status).toBe(403)
    const ok = await get(`/?${q}`, true)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ mode: 'name', query: 'widget', truncated: false })
    expect((await get(`/?path=${encodeURIComponent(repo)}&q=&mode=name`, true)).status).toBe(400)
    expect((await get(`/?path=${encodeURIComponent(repo)}`, true)).status).toBe(400)
    expect((await get(`/?path=relative&q=x`, true)).status).toBe(400)
  })
})
