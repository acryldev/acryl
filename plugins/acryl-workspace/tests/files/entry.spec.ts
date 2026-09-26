import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseFileEntryChange } from '../../src/files/contract.ts'
import { handleWorkspaceFilesEntryRequest } from '../../src/files/route.ts'
import { WorkspaceFiles, WorkspaceFilesError } from '../../src/files/service.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-entry-')))
const repo = join(root, 'proj')
const outside = join(root, 'outside')
const files = new WorkspaceFiles({ resolveWorktree: async path => realpathSync(path) })

beforeEach(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
  mkdirSync(join(repo, 'src', 'empty'), { recursive: true })
  mkdirSync(outside)
  execFileSync('git', ['init', '-q', repo])
  writeFileSync(join(repo, 'src', 'a.ts'), 'a\n')
  writeFileSync(join(outside, 'secret.txt'), 'secret\n')
  symlinkSync(outside, join(repo, 'escape'))
})
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

const fails = (promise: Promise<unknown>, kind: string) => expect(promise).rejects.toMatchObject({ name: 'WorkspaceFilesError', kind })

describe('WorkspaceFiles.change', () => {
  it('creates an empty file and an empty folder', async () => {
    expect(await files.change(repo, { op: 'create', kind: 'file', file: 'src/new.ts' })).toEqual({ path: repo, op: 'create', file: 'src/new.ts' })
    expect(readFileSync(join(repo, 'src', 'new.ts'), 'utf8')).toBe('')
    await files.change(repo, { op: 'create', kind: 'dir', file: 'docs' })
    expect(existsSync(join(repo, 'docs'))).toBe(true)
  })

  it('never overwrites: an existing name or a dangling link is a conflict', async () => {
    await fails(files.change(repo, { op: 'create', kind: 'file', file: 'src/a.ts' }), 'conflict')
    expect(readFileSync(join(repo, 'src', 'a.ts'), 'utf8')).toBe('a\n')
    symlinkSync(join(root, 'nowhere'), join(repo, 'dangling'))
    await fails(files.change(repo, { op: 'create', kind: 'file', file: 'dangling' }), 'conflict')
    await fails(files.change(repo, { op: 'rename', file: 'src/a.ts', to: 'src/empty' }), 'conflict')
  })

  it('refuses paths that leave the worktree, touch .git, or are not folders that exist', async () => {
    for (const file of ['../x', '/abs/x', 'a/../../x', '.git/hooks/x', 'src/.GIT', '', 'a\0b', 'escape/planted.txt']) {
      await expect(files.change(repo, { op: 'create', kind: 'file', file })).rejects.toBeInstanceOf(WorkspaceFilesError)
    }
    expect(existsSync(join(outside, 'planted.txt'))).toBe(false)
    await fails(files.change(repo, { op: 'create', kind: 'file', file: 'missing-dir/x.ts' }), 'not-found')
  })

  it('renames and moves an entry, refusing a move outside the worktree', async () => {
    await files.change(repo, { op: 'rename', file: 'src/a.ts', to: 'src/empty/b.ts' })
    expect(readFileSync(join(repo, 'src', 'empty', 'b.ts'), 'utf8')).toBe('a\n')
    expect(existsSync(join(repo, 'src', 'a.ts'))).toBe(false)
    await fails(files.change(repo, { op: 'rename', file: 'src/empty/b.ts', to: 'escape/b.ts' }), 'invalid')
    await fails(files.change(repo, { op: 'rename', file: 'nothing.ts', to: 'x.ts' }), 'not-found')
  })

  it('deletes a file or an empty folder only', async () => {
    await files.change(repo, { op: 'delete', file: 'src/a.ts' })
    expect(existsSync(join(repo, 'src', 'a.ts'))).toBe(false)
    await files.change(repo, { op: 'delete', file: 'src/empty' })
    expect(existsSync(join(repo, 'src', 'empty'))).toBe(false)
    writeFileSync(join(repo, 'src', 'keep.ts'), 'k')
    await fails(files.change(repo, { op: 'delete', file: 'src' }), 'conflict')
    expect(existsSync(join(repo, 'src', 'keep.ts'))).toBe(true)
    await fails(files.change(repo, { op: 'delete', file: 'src/gone.ts' }), 'not-found')
  })

  it('deletes a symlink as the link and never touches its target', async () => {
    await files.change(repo, { op: 'delete', file: 'escape' })
    expect(existsSync(join(repo, 'escape'))).toBe(false)
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('secret\n')
  })
})

describe('parseFileEntryChange', () => {
  it('accepts exactly the three shapes and nothing else', () => {
    expect(parseFileEntryChange({ path: '/p', op: 'create', kind: 'dir', file: 'a' })).toEqual({ op: 'create', kind: 'dir', file: 'a' })
    expect(parseFileEntryChange({ path: '/p', op: 'rename', file: 'a', to: 'b' })).toEqual({ op: 'rename', file: 'a', to: 'b' })
    expect(parseFileEntryChange({ path: '/p', op: 'delete', file: 'a' })).toEqual({ op: 'delete', file: 'a' })
    for (const bad of [null, [], { op: 'delete' }, { op: 'delete', file: 'a', recursive: true }, { op: 'create', kind: 'link', file: 'a' }, { op: 'rename', file: 'a' }, { op: 'wipe', file: 'a' }]) {
      expect(parseFileEntryChange(bad)).toBeNull()
    }
  })
})

describe('entry route', () => {
  let server: Server
  let origin = ''
  let port = 0
  beforeAll(async () => {
    server = createServer((req, res) => { void handleWorkspaceFilesEntryRequest(req, res, origin, files, () => {}) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

  function post(body: unknown, sameOrigin = true, method = 'POST'): Promise<number> {
    const text = JSON.stringify(body)
    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) }
      if (sameOrigin) Object.assign(headers, { origin, 'sec-fetch-site': 'same-origin' })
      const req = request({ host: '127.0.0.1', port, path: '/', method, headers }, (res) => { res.resume(); res.on('end', () => { resolve(res.statusCode ?? 0) }) })
      req.on('error', reject)
      req.end(text)
    })
  }

  it('maps outcomes to status codes and refuses foreign or malformed requests', async () => {
    expect(await post({ path: repo, op: 'create', kind: 'file', file: 'r.txt' }, false)).toBe(403)
    expect(await post({ path: repo, op: 'create', kind: 'file', file: 'r.txt' }, true, 'PUT')).toBe(405)
    expect(await post({ path: repo, op: 'delete', file: 'a', recursive: true })).toBe(400)
    expect(await post({ path: repo, op: 'create', kind: 'file', file: 'r.txt' })).toBe(200)
    expect(await post({ path: repo, op: 'create', kind: 'file', file: 'r.txt' })).toBe(409)
    expect(await post({ path: repo, op: 'create', kind: 'file', file: '../r.txt' })).toBe(400)
    expect(await post({ path: repo, op: 'delete', file: 'nope.txt' })).toBe(404)
  })
})
