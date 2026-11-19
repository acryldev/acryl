import { describe, expect, it } from 'vitest'
import { createWorkspaceFilesApi, FileConflictError } from '../../src/client/files/files-api.ts'

const respond = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('files api', () => {
  it('reads a tree and a file through the validated contract, sending the worktree and path', async () => {
    const urls: string[] = []
    const api = createWorkspaceFilesApi(async (url) => {
      urls.push(url)
      return url.startsWith('/api/acryl-workspace/files/tree')
        ? respond(200, { path: '/p', dir: 'src', entries: [{ name: 'a.ts', kind: 'file' }], truncated: false })
        : respond(200, { path: '/p', file: 'a.ts', content: 'x', binary: false, size: 1, mtimeMs: 5 })
    })
    expect((await api.tree('/p', 'src')).entries).toEqual([{ name: 'a.ts', kind: 'file' }])
    expect((await api.read('/p', 'src/a.ts')).mtimeMs).toBe(5)
    expect(urls[0]).toContain('path=%2Fp')
    expect(urls[1]).toContain('file=src%2Fa.ts')
  })

  it('surfaces the server message on a refusal and rejects a malformed answer', async () => {
    await expect(createWorkspaceFilesApi(async () => respond(404, { error: 'that file does not exist' })).read('/p', 'x')).rejects.toThrow('that file does not exist')
    await expect(createWorkspaceFilesApi(async () => respond(500, {})).tree('/p', '')).rejects.toThrow(/HTTP 500/)
    await expect(createWorkspaceFilesApi(async () => respond(200, { nope: true })).tree('/p', '')).rejects.toThrow(/invalid/)
  })

  it('posts a save and maps 409 to a FileConflictError', async () => {
    let sent: unknown
    const ok = createWorkspaceFilesApi(async (_url, init) => { sent = JSON.parse(String(init?.body)); return respond(200, { path: '/p', file: 'a', size: 2, mtimeMs: 9 }) })
    expect((await ok.write('/p', 'a', 'hi', 1)).mtimeMs).toBe(9)
    expect(sent).toEqual({ path: '/p', file: 'a', content: 'hi', expectedMtimeMs: 1 })
    const conflict = createWorkspaceFilesApi(async () => respond(409, { error: 'the file changed on disk since you opened it' }))
    await expect(conflict.write('/p', 'a', 'x', 1)).rejects.toBeInstanceOf(FileConflictError)
    await expect(createWorkspaceFilesApi(async () => respond(400, { error: 'bad' })).write('/p', 'a', 'x', 1)).rejects.toThrow('bad')
  })
})
