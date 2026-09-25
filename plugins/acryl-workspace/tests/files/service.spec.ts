import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_EDITABLE_BYTES } from '../../src/files/contract.ts'
import { handleWorkspaceFilesReadRequest, handleWorkspaceFilesTreeRequest, handleWorkspaceFilesWriteRequest } from '../../src/files/route.ts'
import { confine, WorkspaceFiles, WorkspaceFilesError } from '../../src/files/service.ts'
import { WorkspaceGit, WorkspaceGitError } from '../../src/git/service.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-files-')))
const repo = join(root, 'proj')
const outside = join(root, 'outside')
const gitCli = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
}

const gitService = new WorkspaceGit()
const files = new WorkspaceFiles({
  resolveWorktree: async (path) => {
    try {
      return await gitService.worktreeRoot(path)
    } catch (cause) {
      if (cause instanceof WorkspaceGitError && cause.kind === 'invalid') throw new WorkspaceFilesError(cause.message, 'invalid')
      throw cause
    }
  },
})

beforeAll(() => {
  mkdirSync(join(repo, 'src', 'deep'), { recursive: true })
  mkdirSync(outside)
  writeFileSync(join(repo, 'README.md'), '# hi\n')
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src', 'B.ts'), 'export const b = 2\n')
  writeFileSync(join(repo, 'src', 'deep', 'c.ts'), 'c\n')
  writeFileSync(join(repo, 'bin.dat'), Buffer.from([1, 2, 0, 3]))
  writeFileSync(join(outside, 'secret.txt'), 'secret\n')
  symlinkSync(outside, join(repo, 'escape-dir'))
  symlinkSync(join(outside, 'secret.txt'), join(repo, 'escape-file'))
  symlinkSync(join(repo, 'README.md'), join(repo, 'inside-link'))
  gitCli(root, 'init', '-q', 'proj')
  gitCli(repo, 'add', 'README.md', 'src')
  gitCli(repo, 'commit', '-q', '-m', 'init')
})

afterAll(async () => {
  await gitService.dispose()
  rmSync(root, { recursive: true, force: true })
})

describe('confine', () => {
  it('accepts a normal relative path and returns its real path', async () => {
    expect(await confine(repo, 'src/a.ts')).toBe(join(repo, 'src', 'a.ts'))
  })

  it.each([
    ['empty', ''],
    ['absolute', '/etc/passwd'],
    ['parent segment', '../outside/secret.txt'],
    ['nested parent', 'src/../../outside/secret.txt'],
    ['dot git', '.git/config'],
    ['nested dot git, any case', 'src/.GIT/config'],
    ['NUL byte', 'src/a.ts\0'],
  ])('rejects %s', async (_name, path) => {
    await expect(confine(repo, path)).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('rejects a symlink that leaves the worktree and reports a missing path', async () => {
    await expect(confine(repo, 'escape-file')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(confine(repo, 'escape-dir/secret.txt')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(confine(repo, 'nope.ts')).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('WorkspaceFiles.tree', () => {
  it('lists directories first then files, alphabetically, hides .git and leaves out symlinks that escape', async () => {
    const view = await files.tree(repo, '')
    expect(view.entries.map(e => `${e.kind}:${e.name}`)).toEqual([
      'dir:src', 'file:bin.dat', 'file:inside-link', 'file:README.md',
    ])
    expect(view.truncated).toBe(false)
    const src = await files.tree(repo, 'src')
    expect(src.entries.map(e => e.name)).toEqual(['deep', 'a.ts', 'B.ts'])
  })

  it('refuses a path outside the worktree and a directory that is not a git worktree root', async () => {
    await expect(files.tree(repo, '../outside')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(files.tree(join(repo, 'src'), '')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(files.tree(outside, '')).rejects.toBeDefined()
    await expect(files.tree(repo, 'README.md')).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('WorkspaceFiles.read', () => {
  it('reads text with its size and modification time, and flags binary files without sending them', async () => {
    const view = await files.read(repo, 'src/a.ts')
    expect(view).toMatchObject({ file: 'src/a.ts', content: 'export const a = 1\n', binary: false, size: 19 })
    expect(view.mtimeMs).toBe(statSync(join(repo, 'src', 'a.ts')).mtimeMs)
    expect(await files.read(repo, 'bin.dat')).toMatchObject({ binary: true, content: '', size: 4 })
    expect((await files.read(repo, 'inside-link')).content).toBe('# hi\n')
  })

  it('refuses a directory, a missing file, an escaping symlink and an oversized file', async () => {
    await expect(files.read(repo, 'src')).rejects.toMatchObject({ kind: 'not-found' })
    await expect(files.read(repo, 'nope.ts')).rejects.toMatchObject({ kind: 'not-found' })
    await expect(files.read(repo, 'escape-file')).rejects.toMatchObject({ kind: 'invalid' })
    writeFileSync(join(repo, 'big.txt'), 'x'.repeat(MAX_EDITABLE_BYTES + 1))
    await expect(files.read(repo, 'big.txt')).rejects.toMatchObject({ kind: 'too-large' })
    rmSync(join(repo, 'big.txt'))
  })
})

describe('WorkspaceFiles.write', () => {
  it('replaces the text atomically, keeps the file mode, leaves no temp file, and returns the new mtime', async () => {
    const path = join(repo, 'src', 'w.ts')
    writeFileSync(path, 'old\n')
    chmodSync(path, 0o755)
    const before = await files.read(repo, 'src/w.ts')
    const saved = await files.write(repo, 'src/w.ts', 'new text\n', before.mtimeMs)
    expect(readFileSync(path, 'utf8')).toBe('new text\n')
    expect(statSync(path).mode & 0o777).toBe(0o755)
    expect(saved.mtimeMs).toBe(statSync(path).mtimeMs)
    expect(readdirSync(join(repo, 'src')).filter(name => name.includes('.acryl-'))).toEqual([])
  })

  it('refuses to overwrite a file that changed on disk since it was read', async () => {
    const path = join(repo, 'src', 'x.ts')
    writeFileSync(path, 'one\n')
    const before = await files.read(repo, 'src/x.ts')
    writeFileSync(path, 'two\n')
    utimesSync(path, new Date(before.mtimeMs + 5000), new Date(before.mtimeMs + 5000))
    await expect(files.write(repo, 'src/x.ts', 'mine\n', before.mtimeMs)).rejects.toMatchObject({ kind: 'conflict' })
    expect(readFileSync(path, 'utf8')).toBe('two\n')
  })

  it('never creates, escapes, targets .git or writes an oversized text', async () => {
    await expect(files.write(repo, 'brand-new.ts', 'x', 0)).rejects.toMatchObject({ kind: 'not-found' })
    expect(existsSync(join(repo, 'brand-new.ts'))).toBe(false)
    await expect(files.write(repo, 'escape-file', 'pwned', 0)).rejects.toMatchObject({ kind: 'invalid' })
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('secret\n')
    await expect(files.write(repo, '.git/config', 'x', 0)).rejects.toMatchObject({ kind: 'invalid' })
    const before = await files.read(repo, 'src/a.ts')
    await expect(files.write(repo, 'src/a.ts', 'x'.repeat(MAX_EDITABLE_BYTES + 1), before.mtimeMs)).rejects.toMatchObject({ kind: 'too-large' })
  })
})

describe('routes', () => {
  let server: Server
  let origin: string
  let port: number

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = new URL(req.url ?? '', 'http://x').pathname
      const report = (): void => {}
      if (path === '/tree') void handleWorkspaceFilesTreeRequest(req, res, origin, files, report)
      else if (path === '/read') void handleWorkspaceFilesReadRequest(req, res, origin, files, report)
      else void handleWorkspaceFilesWriteRequest(req, res, origin, files, report)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

  function call(method: 'GET' | 'POST', path: string, body: unknown, sameOrigin: boolean): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
      const headers: Record<string, string> = method === 'POST' ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) } : {}
      if (sameOrigin) { headers.origin = origin; headers['sec-fetch-site'] = 'same-origin' }
      const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as unknown }) })
      })
      req.on('error', reject)
      req.end(method === 'POST' ? payload : undefined)
    })
  }

  it('refuses cross-origin requests on every route', async () => {
    expect((await call('GET', `/tree?path=${encodeURIComponent(repo)}`, undefined, false)).status).toBe(403)
    expect((await call('GET', `/read?path=${encodeURIComponent(repo)}&file=README.md`, undefined, false)).status).toBe(403)
    expect((await call('POST', '/write', { path: repo, file: 'README.md', content: 'x', expectedMtimeMs: 0 }, false)).status).toBe(403)
  })

  it('serves a tree and a file, and maps refusals to 400, 404 and 405', async () => {
    const tree = await call('GET', `/tree?path=${encodeURIComponent(repo)}&dir=src`, undefined, true)
    expect(tree.status).toBe(200)
    expect(tree.body).toMatchObject({ dir: 'src' })
    expect((tree.body as { entries: { name: string }[] }).entries[0]).toEqual({ name: 'deep', kind: 'dir' })
    const read = await call('GET', `/read?path=${encodeURIComponent(repo)}&file=README.md`, undefined, true)
    expect(read).toMatchObject({ status: 200, body: { content: '# hi\n', binary: false } })
    expect((await call('GET', `/read?path=${encodeURIComponent(repo)}&file=../outside/secret.txt`, undefined, true)).status).toBe(400)
    expect((await call('GET', `/read?path=${encodeURIComponent(repo)}&file=missing.md`, undefined, true)).status).toBe(404)
    expect((await call('GET', `/read?path=relative&file=a`, undefined, true)).status).toBe(400)
    expect((await call('GET', '/read', undefined, true)).status).toBe(400)
    expect((await call('POST', '/tree', {}, true)).status).toBe(405)
  })

  it('saves over POST, answers 409 on a stale save, and rejects malformed bodies', async () => {
    const path = join(repo, 'route.txt')
    writeFileSync(path, 'a\n')
    const read = await call('GET', `/read?path=${encodeURIComponent(repo)}&file=route.txt`, undefined, true)
    const mtime = (read.body as { mtimeMs: number }).mtimeMs
    const ok = await call('POST', '/write', { path: repo, file: 'route.txt', content: 'b\n', expectedMtimeMs: mtime }, true)
    expect(ok.status).toBe(200)
    expect(readFileSync(path, 'utf8')).toBe('b\n')
    expect((await call('POST', '/write', { path: repo, file: 'route.txt', content: 'c\n', expectedMtimeMs: mtime - 10_000 }, true)).status).toBe(409)
    expect((await call('POST', '/write', { path: repo, file: 'route.txt', content: 'c\n' }, true)).status).toBe(400)
    expect((await call('POST', '/write', { path: repo, file: 'route.txt', content: 'c\n', expectedMtimeMs: 1, extra: 1 }, true)).status).toBe(400)
    expect((await call('POST', '/write', '{ nope', true)).status).toBe(400)
    expect((await call('GET', '/write', undefined, true)).status).toBe(405)
    rmSync(path)
  })
})
